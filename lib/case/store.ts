import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { priorityOf, routeTo, type Priority, type RouteTo } from "./routing";
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
};

export async function saveCase(input: NewCase): Promise<{ token: string; routeTo: RouteTo; priority: Priority }> {
  const { draft } = input;
  const token = newCaseToken();
  const route = routeTo(input.chapter, input.userType ?? undefined, input.kind);
  const text = [draft.question, draft.summaryAr, draft.summaryUser, ...draft.rows.map((r) => `${r.value} ${r.valueAr}`)].join("\n");
  const priority = priorityOf(input.chapter, text);
  const db = createAdminClient();

  const { data: row, error } = await db
    .from("cases")
    .insert({
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
    })
    .select("id")
    .single();
  if (error || !row) throw new Error(`cases insert: ${error?.message ?? "no row"}`);

  const { error: fileError } = await db.from("case_files").insert({
    case_id: row.id,
    pillars: { kind: input.kind, question: draft.question, rows: draft.rows },
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
