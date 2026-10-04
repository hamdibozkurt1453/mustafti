import "server-only";

import { getTranslations } from "next-intl/server";
import { adminStats } from "@/lib/admin/store";
import { CASE_STATUSES, EXPERT_STATUSES, formatDuration } from "@/lib/admin/rules";

/** تبويب «الإحصاءات» (S10) لكل المشرفين: أرقام في بطاقات بسيطة، بلا مكتبة رسوم. */
export async function AdminStats() {
  const t = await getTranslations("admin.stats");
  const tc = await getTranslations("admin.cases.status");
  const te = await getTranslations("experts.review.filters");
  const s = await adminStats();

  const avg =
    s.avgAnswerMinutes === null ? "—" : formatDuration(s.avgAnswerMinutes, { d: t("units.d"), h: t("units.h"), m: t("units.m") });

  return (
    <div className="space-y-6">
      <Group title={t("queries")}>
        <Card label={t("today")} value={s.queriesToday} />
        <Card label={t("week")} value={s.queriesWeek} />
        <Card label={t("abstainRate")} value={s.abstainRateWeek === null ? "—" : `${s.abstainRateWeek}%`} />
      </Group>
      <Group title={t("cases")}>
        {CASE_STATUSES.map((st) => (
          <Card key={st} label={tc(st)} value={s.casesByStatus[st]} />
        ))}
        <Card label={t("avgAnswer")} value={avg} />
      </Group>
      <Group title={t("experts")}>
        {EXPERT_STATUSES.map((st) => (
          <Card key={st} label={te(st)} value={s.expertsByStatus[st]} />
        ))}
      </Group>
      <p className="text-xs text-ink-600">{t("note")}</p>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 font-semibold text-green-900">{title}</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</div>
    </section>
  );
}

function Card({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-sand-200 bg-white p-3">
      <p className="text-xs text-ink-600">{label}</p>
      <p className="mt-1 text-2xl font-bold text-green-900">
        <bdi>{value}</bdi>
      </p>
    </div>
  );
}
