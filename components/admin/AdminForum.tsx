import "server-only";

import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { shortDateTime } from "@/lib/experts/format";
import { availableActions } from "@/lib/forum/rules";
import { adminRecentThreads, openReports } from "@/lib/forum/store";
import { ForumModActions } from "./ForumModActions";

type Status = "visible" | "hidden" | "locked";

/**
 * تبويب «الحوار» (R4): البلاغات المفتوحة (مجمّعة حسب المحتوى) وأحدث المواضيع بكل حالاتها.
 * super_admin وmoderator يرون الأزرار؛ viewer يرى للاطلاع فقط (canAct = false: بلا أزرار).
 * لا يُعرض المُبلِّغ ولا أي بيان عنه: السبب والتفاصيل فقط.
 */
export async function AdminForum({ canAct }: { canAct: boolean }) {
  const t = await getTranslations("admin.forum");
  const tf = await getTranslations("forum");
  const locale = await getLocale();
  const [reports, threads] = await Promise.all([openReports(), adminRecentThreads()]);
  const statusChip = (s: string) =>
    `rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
      s === "hidden" ? "bg-alert-600/10 text-alert-600" : s === "locked" ? "bg-green-900 text-ivory-50" : "bg-green-600/10 text-green-600"
    }`;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-bold text-green-900">{t("reportsTitle")}</h2>
        {!reports.length ? (
          <p className="mt-3 rounded-xl border border-dashed border-sand-200 bg-white p-4 text-center text-sm text-ink-600">{t("noReports")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white">
            {reports.map((g) => (
              <li key={`${g.targetType}:${g.targetId}`} className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-green-900/[0.06] px-2.5 py-0.5 font-semibold text-green-900">{t(`target.${g.targetType}`)}</span>
                  {g.target && <span className={statusChip(g.target.status)}>{t(`status.${g.target.status as Status}`)}</span>}
                  <span className="rounded-full bg-alert-600 px-2.5 py-0.5 font-semibold text-ivory-50">{t("reportsCount", { count: g.reportIds.length })}</span>
                </div>
                {g.target ? (
                  <>
                    <p dir="auto" className="font-semibold text-green-900">
                      {g.target.title}
                    </p>
                    <p dir="auto" className="line-clamp-4 whitespace-pre-line rounded-lg bg-ivory-50 p-3 text-sm text-green-900">
                      {g.target.excerpt}
                    </p>
                    <p className="text-xs text-ink-600">
                      {g.target.author.name || tf("anonymous")}
                      {g.target.author.expert ? ` · ${tf("thread.expertBadge")}` : ""}
                      {" · "}
                      {g.target.status !== "hidden" && (
                        <Link href={`/forum/${g.target.threadId}`} className="font-semibold text-green-600 underline">
                          {t("openThread")}
                        </Link>
                      )}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-ink-600">{t("missingTarget")}</p>
                )}
                <ul className="space-y-1 text-sm">
                  {g.reasons.map((r, i) => (
                    <li key={i} className="text-green-900">
                      <span className="text-ink-600">{t("reason")}: </span>
                      <strong>{tf(`report.reasons.${r.reason}`)}</strong>
                      {r.note && (
                        <span dir="auto" className="text-ink-600">
                          {" "}
                          — {r.note}
                        </span>
                      )}
                      <span className="text-xs text-ink-600"> · {shortDateTime(r.createdAt, locale)}</span>
                    </li>
                  ))}
                </ul>
                {canAct && (
                  <ForumModActions
                    targetType={g.targetType}
                    targetId={g.targetId}
                    actions={g.target ? availableActions(g.targetType, g.target.status, g.target.pinned) : []}
                    reported
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-bold text-green-900">{t("threadsTitle")}</h2>
        {!threads.length ? (
          <p className="mt-3 rounded-xl border border-dashed border-sand-200 bg-white p-4 text-center text-sm text-ink-600">{t("noThreads")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white">
            {threads.map((th) => (
              <li key={th.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2">
                    {th.pinned && <span className="text-xs">📌</span>}
                    <span className={statusChip(th.status)}>{t(`status.${th.status as Status}`)}</span>
                    {th.status !== "hidden" ? (
                      <Link href={`/forum/${th.id}`} dir="auto" className="truncate font-semibold text-green-900 hover:text-green-600">
                        {th.title}
                      </Link>
                    ) : (
                      <span dir="auto" className="truncate font-semibold text-green-900">
                        {th.title}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-ink-600">
                    {th.author.name || tf("anonymous")} · {tf("replies", { count: th.repliesCount })} · {shortDateTime(th.lastActivityAt, locale)}
                  </p>
                </div>
                {canAct && <ForumModActions targetType="thread" targetId={th.id} actions={availableActions("thread", th.status, th.pinned)} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
