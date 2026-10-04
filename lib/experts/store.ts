import "server-only";

import { AuthzError, getAuthContext, type AuthContext } from "@/lib/auth/roles";
import type { CaseRow, CaseUnknown } from "@/lib/case/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { avatarUrl, sortCases, type Contact, type ExpertRole, type Socials } from "./types";

/**
 * قراءات المختصين (S9)، كلها في الخادم بمفتاح service role بعد فحص الدور في الكود.
 * لا يُقرأ هنا أبداً ما يدل على هوية السائل: لا owner_id ولا contact_email ولا الرمز السري
 * ولا المحادثة الخام (case_messages). المختص يرى الملف المرتب فقط.
 */

export type ExpertSelf = { id: string; role: ExpertRole; ctx: AuthContext };

/**
 * المختص المقبول للطلب الحالي، أو AuthzError.
 * يُقرأ الصف من القاعدة في كل طلب (لا من الجلسة)، فسحب القبول يسري فوراً.
 */
export async function requireApprovedExpert(): Promise<ExpertSelf> {
  const ctx = await getAuthContext();
  if (!ctx.userId) throw new AuthzError(401);
  const { data } = await createAdminClient()
    .from("experts")
    .select("role, status")
    .eq("id", ctx.userId)
    .maybeSingle<{ role: ExpertRole; status: string }>();
  if (data?.status !== "approved") throw new AuthzError(403);
  return { id: ctx.userId, role: data.role, ctx };
}

export type QueueCase = {
  id: string;
  chapter: string | null;
  priority: string | null;
  status: string;
  lang: string | null;
  created_at: string;
  mine: boolean;
  summary: string;
};

/** ملفات لوحة المختص: المحالة إلى دوره وتنتظر (submitted بلا مختص)، أو المسندة إليه. */
export async function expertQueue(
  self: ExpertSelf,
  filter: { chapter?: string; status?: string },
): Promise<QueueCase[]> {
  const db = createAdminClient();
  let q = db
    .from("cases")
    .select("id, chapter, priority, status, lang, created_at, assigned_expert, case_files(summary_ar)")
    .or(`and(route_to.eq.${self.role},status.eq.submitted,assigned_expert.is.null),assigned_expert.eq.${self.id}`)
    .order("created_at", { ascending: true })
    .limit(300);
  if (filter.chapter) q = q.eq("chapter", filter.chapter);
  if (filter.status) q = q.eq("status", filter.status);
  const { data, error } = await q.returns<
    {
      id: string;
      chapter: string | null;
      priority: string | null;
      status: string;
      lang: string | null;
      created_at: string;
      assigned_expert: string | null;
      case_files: { summary_ar: string | null }[];
    }[]
  >();
  if (error) console.error("expert queue:", error.message);
  return sortCases(
    (data ?? []).map((c) => ({
      id: c.id,
      chapter: c.chapter,
      priority: c.priority,
      status: c.status,
      lang: c.lang,
      created_at: c.created_at,
      mine: c.assigned_expert === self.id,
      summary: c.case_files[0]?.summary_ar ?? "",
    })),
  );
}

export type ExpertCase = {
  id: string;
  chapter: string | null;
  priority: string | null;
  status: string;
  lang: string | null;
  createdAt: string;
  mine: boolean;
  question: string;
  summaryAr: string;
  rows: CaseRow[];
  unknowns: CaseUnknown[];
  answer: { answerAr: string; answerTranslated: string | null } | null;
  missing: { note: string; createdAt: string }[];
};

/**
 * ملف واحد للمختص، أو null إن لم يكن من حقه:
 * يراه إن كان محالاً إلى دوره وينتظر بلا مختص، أو مسنداً إليه هو.
 */
export async function expertCase(self: ExpertSelf, caseId: string): Promise<ExpertCase | null> {
  if (!/^[0-9a-f-]{36}$/i.test(caseId)) return null;
  const db = createAdminClient();
  const { data: c } = await db
    .from("cases")
    .select("id, chapter, priority, status, lang, created_at, route_to, assigned_expert")
    .eq("id", caseId)
    .maybeSingle();
  if (!c) return null;
  const mine = c.assigned_expert === self.id;
  const open = c.route_to === self.role && c.status === "submitted" && !c.assigned_expert;
  if (!mine && !open) return null;

  const [{ data: file }, { data: answer }, { data: missing }] = await Promise.all([
    db
      .from("case_files")
      .select("pillars, summary_ar, unknowns")
      .eq("case_id", c.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ pillars: { question?: string; rows?: CaseRow[] } | null; summary_ar: string | null; unknowns: CaseUnknown[] | null }>(),
    mine
      ? db.from("expert_answers").select("answer_ar, answer_translated").eq("case_id", c.id).eq("expert_id", self.id).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("feedback_missing").select("note, created_at").eq("case_id", c.id).eq("expert_id", self.id).order("created_at"),
  ]);

  return {
    id: c.id,
    chapter: c.chapter,
    priority: c.priority,
    status: c.status,
    lang: c.lang,
    createdAt: c.created_at,
    mine,
    question: file?.pillars?.question ?? "",
    summaryAr: file?.summary_ar ?? "",
    rows: file?.pillars?.rows ?? [],
    unknowns: file?.unknowns ?? [],
    answer: answer ? { answerAr: answer.answer_ar, answerTranslated: answer.answer_translated } : null,
    missing: (missing ?? []).map((m) => ({ note: m.note, createdAt: m.created_at })),
  };
}

/** يسجّل قرار المشرف في admin_audit (إن تعذّر لا يُفشل القرار، ويُسجَّل الخطأ). */
export async function audit(adminId: string, action: string, target: string, details: Record<string, unknown> = {}) {
  const { error } = await createAdminClient().from("admin_audit").insert({ admin_id: adminId, action, target, details });
  if (error) console.error("admin_audit:", error.message);
}

// ---------------------------------------------------------------------------
// الملف الشخصي والبطاقة العامة (تغيير القرار: السائل يرى بطاقة المختص الذي أجابه، لا العكس).
// contact (الهاتف والبريد) لا يُقرأ هنا أبداً: للمشرفين في مراجعة الطلب فقط.
// ---------------------------------------------------------------------------

export type PublicExpert = {
  id: string;
  slug: string;
  name: string;
  role: ExpertRole;
  specialty: string | null;
  country: string | null;
  languages: string[];
  bio: string | null;
  avatarUrl: string | null;
  socials: Socials;
  answered: number;
};

type PublicRow = {
  id: string;
  slug: string | null;
  role: ExpertRole;
  specialty: string | null;
  country: string | null;
  languages: string[] | null;
  bio: string | null;
  avatar_path: string | null;
  socials: Socials | null;
  profiles: { display_name: string | null } | null;
};

const PUBLIC_COLUMNS =
  "id, slug, role, specialty, country, languages, bio, avatar_path, socials, profiles!experts_id_fkey(display_name)";

/** عدد المسائل التي أجاب عنها المختص (عدد فقط، بلا أي مسألة). */
export async function answeredCount(expertId: string): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("expert_answers")
    .select("id", { count: "exact", head: true })
    .eq("expert_id", expertId);
  if (error) console.error("answered count:", error.message);
  return count ?? 0;
}

function toPublic(row: PublicRow, answered: number): PublicExpert {
  return {
    id: row.id,
    slug: row.slug ?? "",
    name: row.profiles?.display_name ?? "",
    role: row.role,
    specialty: row.specialty,
    country: row.country,
    languages: row.languages ?? [],
    bio: row.bio,
    avatarUrl: avatarUrl(row.avatar_path, SUPABASE_URL),
    socials: row.socials ?? {},
    answered,
  };
}

/** الملف العام بالرابط، للمقبولين فقط (وإلا null). */
export async function publicExpertBySlug(slug: string): Promise<PublicExpert | null> {
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(slug)) return null;
  const { data, error } = await createAdminClient()
    .from("experts")
    .select(PUBLIC_COLUMNS)
    .eq("slug", slug)
    .eq("status", "approved")
    .maybeSingle<PublicRow>();
  if (error) console.error("public expert:", error.message);
  if (!data) return null;
  return toPublic(data, await answeredCount(data.id));
}

/** ملف المختص المقبول نفسه (لصفحة «ملفي الشخصي»)، مع التواصل لأنه صاحبه. */
export async function ownExpertProfile(
  expertId: string,
): Promise<(PublicExpert & { avatarPath: string | null; contact: Contact }) | null> {
  const { data, error } = await createAdminClient()
    .from("experts")
    .select(`${PUBLIC_COLUMNS}, contact`)
    .eq("id", expertId)
    .maybeSingle<PublicRow & { contact: Contact | null }>();
  if (error) console.error("own expert profile:", error.message);
  if (!data) return null;
  return {
    ...toPublic(data, await answeredCount(data.id)),
    avatarPath: data.avatar_path,
    contact: { phone: data.contact?.phone ?? "", email: data.contact?.email ?? "" },
  };
}

export type AnswerCard = { name: string; specialty: string | null; avatarUrl: string | null; slug: string };

/** بطاقات «أجاب عن مسألتك» لمعرّفات المختصين، للمقبولين فقط. */
export async function answerCards(expertIds: string[]): Promise<Map<string, AnswerCard>> {
  const ids = [...new Set(expertIds)].filter(Boolean);
  const out = new Map<string, AnswerCard>();
  if (!ids.length) return out;
  const { data, error } = await createAdminClient()
    .from("experts")
    .select("id, slug, specialty, avatar_path, profiles!experts_id_fkey(display_name)")
    .in("id", ids)
    .eq("status", "approved")
    .returns<{ id: string; slug: string | null; specialty: string | null; avatar_path: string | null; profiles: { display_name: string | null } | null }[]>();
  if (error) console.error("answer cards:", error.message);
  for (const e of data ?? []) {
    if (!e.slug) continue;
    out.set(e.id, {
      name: e.profiles?.display_name ?? "",
      specialty: e.specialty,
      avatarUrl: avatarUrl(e.avatar_path, SUPABASE_URL),
      slug: e.slug,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// إشعارات داخل الموقع: أعداد فقط، تُحسب في الخادم.
// ---------------------------------------------------------------------------

/** الطلبات المعلّقة (لـ super_admin وreviewer). */
export async function pendingApplicationsCount(): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("experts")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) console.error("pending applications count:", error.message);
  return count ?? 0;
}

/** الملفات المتاحة لدور المختص: محالة إليه، تنتظر، ولم يتولّها أحد. */
export async function availableCasesCount(role: ExpertRole): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("cases")
    .select("id", { count: "exact", head: true })
    .eq("route_to", role)
    .eq("status", "submitted")
    .is("assigned_expert", null);
  if (error) console.error("available cases count:", error.message);
  return count ?? 0;
}
