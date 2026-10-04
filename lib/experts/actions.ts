"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthzError, requireRole } from "@/lib/auth/roles";
import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";
import { audit, requireApprovedExpert } from "./store";
import { translateAnswer } from "./translate";
import {
  ANSWER_LIMITS,
  ApplicationSchema,
  AVATAR_BUCKET,
  isOwnAvatarPath,
  makeSlug,
  ProfileEditSchema,
  type Contact,
  DOC_TYPES,
  EXPERT_BUCKET,
  MAX_DOCS,
  docProblem,
  isOwnDocPath,
  needsTranslation,
} from "./types";

/**
 * أفعال S9 في الخادم: طلب الانضمام، وقرار المشرف، وتولّي الملف والجواب و«ينقص هذا السؤال».
 * كل فعل يفحص الدور أولاً في الخادم، ثم يكتب بمفتاح service role. لا يُوثق بأي معرّف من المتصفح
 * إلا بعد التحقق من أنه يخص صاحب الطلب.
 */

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

function authzFail(error: unknown): { ok: false; error: string } {
  if (error instanceof AuthzError) return fail(error.status === 401 ? "unauthorized" : "forbidden");
  console.error("experts action:", error instanceof Error ? error.message : error);
  return fail("generic");
}

async function requireUser(): Promise<string> {
  if (!isAdminClientConfigured()) throw new Error("not configured");
  const ctx = await requireRole(["user"]);
  return ctx.userId!;
}

async function hasApplication(userId: string): Promise<boolean> {
  const { data } = await createAdminClient().from("experts").select("id").eq("id", userId).maybeSingle();
  return Boolean(data);
}

// ---------------------------------------------------------------------------
// طلب الانضمام (/experts/join)
// ---------------------------------------------------------------------------

/**
 * رابط رفع موقّع لوثيقة واحدة إلى expert-docs/{user_id}/{uuid}.{ext}.
 * الرفع نفسه من المتصفح مباشرة إلى المخزن بهذا الرابط (حد Vercel لجسم الطلب 4.5MB لا يكفي لـ10MB)،
 * والمخزن يفرض النوع والحجم مرة ثانية.
 */
export async function createDocUpload(file: { type: string; size: number }): Promise<ActionResult<{ path: string; token: string }>> {
  try {
    const userId = await requireUser();
    const problem = docProblem(file);
    if (problem) return fail(problem);
    if (await hasApplication(userId)) return fail("duplicate");
    const path = `${userId}/${randomUUID()}.${DOC_TYPES[file.type]}`;
    const { data, error } = await createAdminClient().storage.from(EXPERT_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return fail("upload");
    return { ok: true, path, token: data.token };
  } catch (error) {
    return authzFail(error);
  }
}

/** يحذف وثيقة رفعها صاحبها قبل إرسال الطلب. */
export async function removeDocUpload(path: string): Promise<ActionResult> {
  try {
    const userId = await requireUser();
    if (!isOwnDocPath(path, userId) || (await hasApplication(userId))) return fail("forbidden");
    await createAdminClient().storage.from(EXPERT_BUCKET).remove([path]);
    return { ok: true };
  } catch (error) {
    return authzFail(error);
  }
}

/** هل الصورة في مجلد صاحبها وموجودة فعلاً في المخزن العام؟ */
async function avatarExists(path: string, userId: string): Promise<boolean> {
  if (!isOwnAvatarPath(path, userId)) return false;
  const name = path.slice(userId.length + 1);
  const { data, error } = await createAdminClient().storage.from(AVATAR_BUCKET).list(userId, { search: name, limit: 10 });
  return !error && (data ?? []).some((o) => o.name === name);
}

/** يحذف الحقول الفارغة من التواصل. */
function cleanContact(c: Contact): Partial<Contact> {
  return Object.fromEntries(Object.entries(c).filter(([, v]) => v)) as Partial<Contact>;
}

/** يرسل الطلب: status = pending. طلب واحد لكل حساب (المفتاح الأساسي يمنع السباق أيضاً). */
export async function submitApplication(input: unknown): Promise<ActionResult> {
  try {
    const userId = await requireUser();
    const parsed = ApplicationSchema.safeParse(input);
    if (!parsed.success) return fail("invalid");
    const a = parsed.data;
    if (await hasApplication(userId)) return fail("duplicate");

    // كل وثيقة يجب أن تكون في مجلد صاحب الطلب وموجودة فعلاً في المخزن.
    const docPaths = [...new Set(a.docPaths)].slice(0, MAX_DOCS);
    if (!docPaths.every((p) => isOwnDocPath(p, userId))) return fail("invalid");
    const db = createAdminClient();
    if (docPaths.length) {
      const { data: listed, error } = await db.storage.from(EXPERT_BUCKET).list(userId, { limit: 100 });
      if (error) return fail("generic");
      const names = new Set((listed ?? []).map((o) => `${userId}/${o.name}`));
      if (!docPaths.every((p) => names.has(p))) return fail("docsMissing");
    }

    if (a.avatarPath && !(await avatarExists(a.avatarPath, userId))) return fail("invalid");

    const { error: profileError } = await db.from("profiles").update({ display_name: a.displayName }).eq("id", userId);
    if (profileError) return fail("generic");

    const { error } = await db.from("experts").insert({
      id: userId,
      slug: makeSlug(a.displayName, randomBytes(6).toString("hex").slice(0, 6)),
      bio: a.bio,
      avatar_path: a.avatarPath,
      contact: cleanContact(a.contact),
      socials: a.socials,
      role: a.role,
      specialty: a.specialty,
      country: a.country,
      languages: [...new Set(a.languages)],
      degree: a.traditional ? a.degree || null : a.degree,
      institution: a.traditional ? a.institution || null : a.institution,
      grad_year: a.gradYear,
      traditional: a.traditional,
      tazkiyat: a.tazkiyat,
      doc_paths: docPaths,
      pledge_at: new Date().toISOString(),
      status: "pending",
    });
    if (error) return fail(error.code === "23505" ? "duplicate" : "generic");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return authzFail(error);
  }
}

// ---------------------------------------------------------------------------
// قرار المشرف (super_admin أو reviewer، بعد MFA)
// ---------------------------------------------------------------------------

const DecisionSchema = z.object({
  expertId: z.uuid(),
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().max(ANSWER_LIMITS.reason).default(""),
});

export async function decideApplication(input: unknown): Promise<ActionResult> {
  try {
    const admin = await requireRole(["super_admin", "reviewer"]);
    const parsed = DecisionSchema.safeParse(input);
    if (!parsed.success) return fail("invalid");
    const { expertId, decision, reason } = parsed.data;
    if (decision === "rejected" && reason.length < 3) return fail("reasonRequired");

    // تحديث مشروط: لا يُبت في طلب إلا وهو معلّق (لا قراران متضاربان).
    const { data, error } = await createAdminClient()
      .from("experts")
      .update({
        status: decision,
        decided_by: admin.userId,
        decided_at: new Date().toISOString(),
        reject_reason: decision === "rejected" ? reason : null,
      })
      .eq("id", expertId)
      .eq("status", "pending")
      .select("id");
    if (error) return fail("generic");
    if (!data?.length) return fail("alreadyDecided");

    await audit(admin.userId!, decision === "approved" ? "expert.approve" : "expert.reject", expertId, {
      role: admin.role,
      ...(decision === "rejected" ? { reason } : {}),
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return authzFail(error);
  }
}

// ---------------------------------------------------------------------------
// لوحة المختص (/expert)
// ---------------------------------------------------------------------------

const CaseIdSchema = z.uuid();

/**
 * «أتولّى هذا الملف»: تحديث ذري واحد بشرط أن الملف لدوره، وينتظر، ولم يُسند لأحد.
 * لو ضغط مختصان معاً ينجح الأول فقط، ويرى الثاني «تولّاه مختص آخر».
 */
export async function claimCase(caseId: string): Promise<ActionResult> {
  try {
    const self = await requireApprovedExpert();
    if (!CaseIdSchema.safeParse(caseId).success) return fail("invalid");
    const { data, error } = await createAdminClient()
      .from("cases")
      .update({ assigned_expert: self.id, status: "assigned" })
      .eq("id", caseId)
      .eq("route_to", self.role)
      .eq("status", "submitted")
      .is("assigned_expert", null)
      .select("id");
    if (error) return fail("generic");
    if (!data?.length) return fail("taken");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return authzFail(error);
  }
}

/**
 * «اعتماد وإرسال»: answer_ar كما كتبه المختص (بلا حارس: الحكم منه مسموح).
 * إن كانت لغة السائل غير العربية يُترجم إلى answer_translated، وإن فشلت الترجمة يُحفظ العربي وحده.
 * الحالة تنتقل assigned → answered بتحديث مشروط، فلا جوابان لملف واحد.
 */
export async function submitAnswer(input: { caseId: string; answerAr: string }): Promise<ActionResult<{ translated: boolean }>> {
  try {
    const self = await requireApprovedExpert();
    if (!CaseIdSchema.safeParse(input.caseId).success) return fail("invalid");
    const answerAr = String(input.answerAr ?? "").trim();
    if (answerAr.length < 2) return fail("empty");
    if (answerAr.length > ANSWER_LIMITS.answer) return fail("tooLong");

    const db = createAdminClient();
    const { data: c } = await db
      .from("cases")
      .select("id, lang, status, assigned_expert")
      .eq("id", input.caseId)
      .maybeSingle();
    if (!c || c.assigned_expert !== self.id) return fail("forbidden");
    if (c.status !== "assigned") return fail("alreadyAnswered");

    const translated = needsTranslation(c.lang) ? await translateAnswer(answerAr, c.lang!) : null;

    const { data: moved, error: moveError } = await db
      .from("cases")
      .update({ status: "answered" })
      .eq("id", c.id)
      .eq("assigned_expert", self.id)
      .eq("status", "assigned")
      .select("id");
    if (moveError) return fail("generic");
    if (!moved?.length) return fail("alreadyAnswered");

    const { error } = await db.from("expert_answers").insert({
      case_id: c.id,
      expert_id: self.id,
      answer_ar: answerAr,
      answer_translated: translated,
    });
    if (error) {
      // أعِد الحالة حتى لا يبقى ملف «أُجيب» بلا جواب.
      await db.from("cases").update({ status: "assigned" }).eq("id", c.id).eq("assigned_expert", self.id);
      return fail("generic");
    }

    // الإشعار بالبريد معطّل عمداً: لا خدمة بريد مهيأة في المشروع (Supabase Auth يرسل رسائل الدخول فقط).
    // عند إضافة خدمة بريد لاحقاً: أرسل إلى cases.contact_email رابطاً عاماً بلا محتوى الجواب ولا اسم المختص.

    revalidatePath("/", "layout");
    return { ok: true, translated: Boolean(translated) };
  } catch (error) {
    return authzFail(error);
  }
}

/** «ينقص هذا السؤال»: ملاحظة المختص على ملف يراه (محال إلى دوره أو مسند إليه). */
export async function reportMissing(input: { caseId: string; note: string }): Promise<ActionResult> {
  try {
    const self = await requireApprovedExpert();
    if (!CaseIdSchema.safeParse(input.caseId).success) return fail("invalid");
    const note = String(input.note ?? "").trim();
    if (note.length < 3) return fail("empty");
    if (note.length > ANSWER_LIMITS.note) return fail("tooLong");

    const db = createAdminClient();
    const { data: c } = await db.from("cases").select("route_to, status, assigned_expert").eq("id", input.caseId).maybeSingle();
    const allowed =
      c && (c.assigned_expert === self.id || (c.route_to === self.role && c.status === "submitted" && !c.assigned_expert));
    if (!allowed) return fail("forbidden");

    const { error } = await db.from("feedback_missing").insert({ case_id: input.caseId, expert_id: self.id, note });
    if (error) return fail("generic");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return authzFail(error);
  }
}


// ---------------------------------------------------------------------------
// «ملفي الشخصي» (/expert/profile): المختص المقبول يعدّل الصورة والنبذة والتواصل والحسابات فقط.
// الاسم والدور والتخصص والبلد واللغات تبقى كما راجعها المشرف.
// ---------------------------------------------------------------------------

export async function updateOwnProfile(input: unknown): Promise<ActionResult> {
  try {
    const self = await requireApprovedExpert();
    const parsed = ProfileEditSchema.safeParse(input);
    if (!parsed.success) return fail("invalid");
    const p = parsed.data;
    if (p.avatarPath && !(await avatarExists(p.avatarPath, self.id))) return fail("invalid");
    const { error } = await createAdminClient()
      .from("experts")
      .update({ bio: p.bio, avatar_path: p.avatarPath, contact: cleanContact(p.contact), socials: p.socials })
      .eq("id", self.id)
      .eq("status", "approved");
    if (error) return fail("generic");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return authzFail(error);
  }
}
