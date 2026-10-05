import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CaseTrack } from "@/lib/brain/modes";
import { fallbackNoteAr, priorityOf, resolveRoute, routeTo, type Priority, type RouteTo } from "./routing";
import type { CaseDraft, CaseRow, CaseUnknown, Chapter, ReferralKind } from "./types";

/**
 * حفظ ملف المسألة وفتحه بالرمز السري (S2: القاعدة تخزّن بصمة SHA-256 للرمز لا الرمز نفسه).
 * الكتابة عبر الخادم بمفتاح service role فقط، بعد حذف الهوية في المسار نفسه.
 * لا تُحفظ المحادثة الخام (case_messages): قد تحمل ما يدل على الهوية، والملف المرتب يكفي.
 */

/** رمز سري عشوائي طويل: 32 بايت (256 بت) بترميز base64url، 43 حرفاً. */
export function newCaseToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashCaseToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** شكل الرمز قبل البحث (لا استعلام لرمز ظاهر الخطأ). */
export function isCaseTokenShape(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export type NewCase = {
  draft: CaseDraft;
  lang: string;
  chapter: Chapter;
  userType?: string | null;
  kind: ReferralKind;
  email?: string | null;
  ownerId?: string | null;
  /** رمز بلد السائل (ISO، من ترويسة x-vercel-ip-country) لتوجيه الملف إلى مختص من بلده. لا عنوان IP. */
  askerCountry?: string | null;
  /** R3: مسار المسألة (general، new_muslim من «المرشد»، discover من «الداعية»). */
  track?: CaseTrack;
};

/**
 * خطأ «العمود غير موجود» قبل تنفيذ migration الحقل (20261009_case_track.sql): يُعاد الطلب بلا العمود،
 * فلا تتعطل المسائل ولا اللوحات في الفترة بين النشر وتنفيذ الـ migration.
 */
export function missingColumn(error: { message?: string; code?: string } | null | undefined, column: string): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204" || new RegExp(`\b${column}\b`).test(error.message ?? "");
}

/** هل لدور المختص مختص معتمد واحد على الأقل؟ (للاحتياط إلى المفتي). null إن تعذّرت القراءة. */
async function approvedRoles(db: ReturnType<typeof createAdminClient>, role: RouteTo): Promise<Set<string> | null> {
  if (role === "mufti") return new Set(["mufti"]);
  const { count, error } = await db.from("experts").select("id", { count: "exact", head: true }).eq("status", "approved").eq("role", role);
  if (error) {
    console.error("approved experts:", error.message);
    return null;
  }
  return new Set(count ? [role] : []);
}

export async function saveCase(input: NewCase): Promise<{ token: string; routeTo: RouteTo; priority: Priority }> {
  const { draft } = input;
  const token = newCaseToken();
  const track = input.track ?? "general";
  const db = createAdminClient();
  const wanted = routeTo(input.chapter, input.userType ?? undefined, input.kind, track);
  const { routeTo: route, fallbackFrom } = resolveRoute(wanted, await approvedRoles(db, wanted));
  const text = [draft.question, draft.summaryAr, draft.summaryUser, ...draft.rows.map((r) => `${r.value} ${r.valueAr}`)].join("\n");
  const priority = priorityOf(input.chapter, text);

  const values = {
    secret_token_hash: hashCaseToken(token),
    owner_id: input.ownerId ?? null,
    user_type: input.userType ?? null,
    level: "D",
    chapter: input.chapter,
    priority,
    lang: input.lang.slice(0, 10),
    status: "submitted",
    route_to: route,
    contact_email: input.email || null,
    asker_country: input.askerCountry ?? null,
    track,
  };
  const insert = (v: Record<string, unknown>) => db.from("cases").insert(v).select("id").single();
  let { data: row, error } = await insert(values);
  if (error && missingColumn(error, "track")) {
    // قبل تنفيذ الـ migration: تُحفظ المسألة بلا المسار (ويبقى التوجيه بالدور صحيحاً).
    console.error("cases.track missing: run supabase/migrations/20261009_case_track.sql");
    const legacy: Record<string, unknown> = { ...values };
    delete legacy.track;
    ({ data: row, error } = await insert(legacy));
  }
  if (error || !row) throw new Error(`cases insert: ${error?.message ?? "no row"}`);

  const { error: fileError } = await db.from("case_files").insert({
    case_id: row.id,
    pillars: {
      kind: input.kind,
      question: draft.question,
      rows: draft.rows,
      // ملاحظة الاحتياط: طُلب مرشد أو داعية ولا معتمد منهم الآن، فأُحيلت إلى المفتي.
      ...(fallbackFrom ? { routing: { wanted: fallbackFrom, note: fallbackNoteAr(fallbackFrom) } } : {}),
    },
    summary_ar: draft.summaryAr,
    summary_user_lang: draft.summaryUser,
    unknowns: draft.unknowns,
    approved_at: new Date().toISOString(),
  });
  if (fileError) {
    await db.from("cases").delete().eq("id", row.id);
    throw new Error(`case_files insert: ${fileError.message}`);
  }
  return { token, routeTo: route, priority };
}

export type CaseView = {
  status: "clarifying" | "submitted" | "assigned" | "answered" | "closed";
  chapter: string | null;
  lang: string | null;
  routeTo: RouteTo | null;
  createdAt: string;
  question: string;
  summaryAr: string;
  summaryUser: string;
  rows: CaseRow[];
  unknowns: CaseUnknown[];
  /** expertId للخادم فقط (لبطاقة «أجاب عن مسألتك»)، ولا يُرسل إلى المتصفح. */
  answers: { answerAr: string; answerTranslated: string | null; createdAt: string; expertId: string }[];
};

type CaseFileRow = {
  pillars: { question?: string; rows?: CaseRow[] } | null;
  summary_ar: string | null;
  summary_user_lang: string | null;
  unknowns: CaseUnknown[] | null;
};

/** يفتح الملف بالرمز السري (بصمته)، أو null. */
export async function getCaseByToken(token: string): Promise<CaseView | null> {
  if (!isCaseTokenShape(token)) return null;
  const db = createAdminClient();
  const { data: c } = await db
    .from("cases")
    .select("id, status, chapter, lang, route_to, created_at")
    .eq("secret_token_hash", hashCaseToken(token))
    .maybeSingle();
  if (!c) return null;
  const [{ data: file }, { data: answers }] = await Promise.all([
    db
      .from("case_files")
      .select("pillars, summary_ar, summary_user_lang, unknowns")
      .eq("case_id", c.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<CaseFileRow>(),
    db.from("expert_answers").select("answer_ar, answer_translated, created_at, expert_id").eq("case_id", c.id).order("created_at"),
  ]);
  return {
    status: c.status,
    chapter: c.chapter,
    lang: c.lang,
    routeTo: c.route_to,
    createdAt: c.created_at,
    question: file?.pillars?.question ?? "",
    summaryAr: file?.summary_ar ?? "",
    summaryUser: file?.summary_user_lang ?? "",
    rows: file?.pillars?.rows ?? [],
    unknowns: file?.unknowns ?? [],
    answers: (answers ?? []).map((a) => ({
      answerAr: a.answer_ar,
      answerTranslated: a.answer_translated,
      createdAt: a.created_at,
      expertId: a.expert_id,
    })),
  };
}
