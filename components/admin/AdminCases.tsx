import "server-only";

import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { listCases } from "@/lib/admin/store";
import { canClose, canReassign, CASE_STATUSES, type CaseStatus } from "@/lib/admin/rules";
import { CASE_TRACKS, type CaseTrack } from "@/lib/brain/modes";
import { countryName } from "@/lib/experts/countries";
import { chapterAr, shortDateTime } from "@/lib/experts/format";
import { CaseActions } from "./CaseActions";

/**
 * تبويب «الملفات» (S10): super_admin وmoderator، وviewer للاطلاع فقط (canAct = false: بلا أزرار).
 * لا هوية للسائل: الحالة والباب والأولوية وبلده (اسماً) والمختص المسند إليه والتاريخ فقط.
 * R3: المشرف يرى كل المسائل، مع فلتر المسار (عام، المسلم الجديد، تعرّف على الإسلام) والدور المحالة إليه.
 */
export async function AdminCases({
  base,
  status,
  track,
  canAct,
}: {
  base: string;
  status: string | undefined;
  track?: string;
  canAct: boolean;
}) {
  const t = await getTranslations("admin.cases");
  const tr = await getTranslations("experts.dashboard");
  const tj = await getTranslations("experts.join");
  const locale = await getLocale();
  const filter = (CASE_STATUSES as readonly string[]).includes(status ?? "") ? (status as CaseStatus) : null;
  const trackFilter = (CASE_TRACKS as readonly string[]).includes(track ?? "") ? (track as CaseTrack) : null;
  const cases = await listCases(filter, 200, trackFilter);

  const href = (s: CaseStatus | null, k: CaseTrack | null) =>
    `${base}?tab=cases${s ? `&status=${s}` : ""}${k ? `&track=${k}` : ""}`;
  const filters: { key: CaseStatus | null; href: string }[] = [
    { key: null, href: href(null, trackFilter) },
    ...CASE_STATUSES.map((s) => ({ key: s, href: href(s, trackFilter) })),
  ];
  const trackFilters: { key: CaseTrack | null; href: string }[] = [
    { key: null, href: href(filter, null) },
    ...CASE_TRACKS.map((k) => ({ key: k, href: href(filter, k) })),
  ];

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f.key ?? "all"}
            href={f.href}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${
              f.key === filter ? "border-green-900 bg-green-900 text-ivory-50" : "border-sand-200 bg-white text-green-900"
            }`}
          >
            {f.key ? t(`status.${f.key}`) : t("all")}
          </Link>
        ))}
      </nav>
      <nav aria-label={tr("filterTrack")} className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-ink-600">{tr("filterTrack")}:</span>
        {trackFilters.map((f) => (
          <Link
            key={f.key ?? "all"}
            href={f.href}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              f.key === trackFilter ? "border-green-600 bg-green-600 text-ivory-50" : "border-sand-200 bg-white text-green-900"
            }`}
          >
            {f.key ? tr(`tracks.${f.key}`) : t("all")}
          </Link>
        ))}
      </nav>
      {!cases.length ? (
        <p className="rounded-xl border border-dashed border-sand-200 bg-white p-4 text-center text-sm text-ink-600">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white">
          {cases.map((c) => (
            <li key={c.id} className="space-y-1.5 px-3 py-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-green-900/5 px-2.5 py-0.5 text-xs font-semibold text-green-900">{t(`status.${c.status}`)}</span>
                {c.priority === "high" && (
                  <span className="rounded-full bg-alert-600/10 px-2.5 py-0.5 text-xs font-semibold text-alert-600">{t("priorityHigh")}</span>
                )}
                <bdi className="font-semibold text-green-900">{chapterAr(c.chapter)}</bdi>
                {c.track !== "general" && (
                  <span className="rounded-full bg-gold-500/20 px-2.5 py-0.5 text-xs font-semibold text-green-900">{tr(`tracks.${c.track}`)}</span>
                )}
                <span className="ms-auto text-xs text-ink-600">
                  <bdi>{shortDateTime(c.createdAt, locale)}</bdi>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-600">
                <span>
                  {t("priority")}: <bdi>{c.priority ? t(`priorities.${c.priority === "high" ? "high" : "normal"}`) : "—"}</bdi>
                </span>
                <span>
                  {t("country")}: <bdi>{countryName(c.askerCountry, locale) ?? "—"}</bdi>
                </span>
                <span>
                  {t("expert")}: <bdi dir="auto">{c.expertName ?? t("unassigned")}</bdi>
                </span>
                {c.routeTo && (
                  <span>
                    {tr("routedTo")}: <bdi>{tj(`roles.${c.routeTo}`)}</bdi>
                  </span>
                )}
                {canAct && (
                  <span className="ms-auto">
                    <CaseActions caseId={c.id} reassign={canReassign(c.status)} close={canClose(c.status)} />
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
