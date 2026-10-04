import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { averageAnswerMinutes, CASE_STATUSES, EXPERT_STATUSES, percent, statsWindows, type CaseStatus } from "./rules";

/**
 * قراءات لوحة المشرف (S10) بمفتاح service role، ولا تُستدعى إلا بعد requireRole في الصفحة.
 * لا يُقرأ أبداً ما يدل على هوية السائل: لا owner_id ولا contact_email ولا الرمز السري
 * ولا المحادثة الخام. بلد السائل رمز ISO فقط.
 */

export type AdminCase = {
  id: string;
  status: CaseStatus;
  chapter: string | null;
  priority: string | null;
  askerCountry: string | null;
  createdAt: string;
  expertName: string | null;
};

/** كل الملفات بالأحدث (أو بحالة واحدة)، مع اسم المختص المسند إليه. */
export async function listCases(status: CaseStatus | null, limit = 200): Promise<AdminCase[]> {
  const db = createAdminClient();
  let q = db
    .from("cases")
    .select("id, status, chapter, priority, asker_country, created_at, assigned_expert")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status) q = q.eq("status", status);
  const { data, error } = await q.returns<
    { id: string; status: CaseStatus; chapter: string | null; priority: string | null; asker_country: string | null; created_at: string; assigned_expert: string | null }[]
  >();
  if (error) console.error("admin cases:", error.message);
  const rows = data ?? [];

  const ids = [...new Set(rows.map((r) => r.assigned_expert).filter((x): x is string => Boolean(x)))];
  const names = new Map<string, string | null>();
  if (ids.length) {
    const { data: profiles } = await db.from("profiles").select("id, display_name").in("id", ids);
    for (const p of profiles ?? []) names.set(p.id, p.display_name);
  }

  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    chapter: r.chapter,
    priority: r.priority,
    askerCountry: r.asker_country,
    createdAt: r.created_at,
    expertName: r.assigned_expert ? (names.get(r.assigned_expert) ?? "—") : null,
  }));
}

export type AdminStats = {
  queriesToday: number;
  queriesWeek: number;
  abstainRateWeek: number | null;
  casesByStatus: Record<CaseStatus, number>;
  avgAnswerMinutes: number | null;
  expertsByStatus: Record<(typeof EXPERT_STATUSES)[number], number>;
};

/** أرقام تبويب «الإحصاءات». العدّ في القاعدة (head: true) بلا جلب الصفوف. */
export async function adminStats(now = new Date()): Promise<AdminStats> {
  const db = createAdminClient();
  const { dayStart, weekStart } = statsWindows(now);

  const count = async (p: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
    const { count: n, error } = await p;
    if (error) console.error("admin stats:", error.message);
    return n ?? 0;
  };
  const queries = () => db.from("general_queries").select("id", { count: "exact", head: true });

  const [queriesToday, queriesWeek, abstainedWeek, caseCounts, expertCounts, answers] = await Promise.all([
    count(queries().gte("created_at", dayStart.toISOString())),
    count(queries().gte("created_at", weekStart.toISOString())),
    count(queries().gte("created_at", weekStart.toISOString()).eq("abstained", true)),
    Promise.all(CASE_STATUSES.map((s) => count(db.from("cases").select("id", { count: "exact", head: true }).eq("status", s)))),
    Promise.all(EXPERT_STATUSES.map((s) => count(db.from("experts").select("id", { count: "exact", head: true }).eq("status", s)))),
    db
      .from("expert_answers")
      .select("case_id, created_at, cases(created_at)")
      .order("created_at", { ascending: false })
      .limit(1000)
      .returns<{ case_id: string; created_at: string; cases: { created_at: string } | null }[]>(),
  ]);
  if (answers.error) console.error("admin stats answers:", answers.error.message);

  return {
    queriesToday,
    queriesWeek,
    abstainRateWeek: percent(abstainedWeek, queriesWeek),
    casesByStatus: Object.fromEntries(CASE_STATUSES.map((s, i) => [s, caseCounts[i]])) as AdminStats["casesByStatus"],
    avgAnswerMinutes: averageAnswerMinutes(
      (answers.data ?? [])
        .filter((a) => a.cases?.created_at)
        .map((a) => ({ case_id: a.case_id, created_at: a.created_at, case_created_at: a.cases!.created_at })),
    ),
    expertsByStatus: Object.fromEntries(EXPERT_STATUSES.map((s, i) => [s, expertCounts[i]])) as AdminStats["expertsByStatus"],
  };
}
