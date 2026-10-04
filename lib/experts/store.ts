import "server-only";

import { AuthzError, getAuthContext, type AuthContext } from "@/lib/auth/roles";
import type { CaseRow, CaseUnknown } from "@/lib/case/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { sortCases, type ExpertRole } from "./types";

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
