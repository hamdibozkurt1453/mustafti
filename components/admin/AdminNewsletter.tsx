import "server-only";

import { getLocale, getTranslations } from "next-intl/server";
import { localeNames, type Locale } from "@/i18n/locales";
import { shortDateTime } from "@/lib/experts/format";
import { newsletterSubscribers } from "@/lib/newsletter/store";

/** F3: تبويب «النشرة» (super_admin وحده): العدد، وأحدث 200 مشترك، وتصدير الكل CSV. */
export async function AdminNewsletter() {
  const t = await getTranslations("admin.newsletter");
  const locale = await getLocale();
  const { total, rows, ready } = await newsletterSubscribers();
  if (!ready) return <p className="rounded-xl border border-dashed border-sand-200 bg-white p-4 text-center text-sm text-ink-600">{t("notReady")}</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-display text-2xl font-bold text-green-900 tabular-nums">{t("total", { count: total })}</p>
        {total > 0 && (
          <a href="/api/admin/newsletter" download className="mf-press inline-flex items-center gap-2 rounded-full bg-green-900 px-4 py-2 text-sm font-semibold text-ivory-50 hover:bg-green-600">
            {t("export")}
            <span aria-hidden>↓</span>
          </a>
        )}
      </div>
      {!rows.length ? (
        <p className="rounded-xl border border-dashed border-sand-200 bg-white p-4 text-center text-sm text-ink-600">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-sand-200 bg-white">
          {total > rows.length && <p className="border-b border-sand-200 px-4 py-2 text-xs text-ink-600">{t("latest")}</p>}
          <table className="w-full text-sm">
            <thead className="text-start text-xs text-ink-600">
              <tr className="border-b border-sand-200">
                <th className="px-4 py-2 text-start font-semibold">{t("email")}</th>
                <th className="px-4 py-2 text-start font-semibold">{t("lang")}</th>
                <th className="px-4 py-2 text-start font-semibold">{t("confirmed")}</th>
                <th className="px-4 py-2 text-start font-semibold">{t("date")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-200">
              {rows.map((r) => (
                <tr key={r.email}>
                  <td className="px-4 py-2 font-medium text-green-900" dir="ltr">{r.email}</td>
                  <td className="px-4 py-2 text-ink-600">{localeNames[r.lang as Locale] ?? r.lang}</td>
                  <td className="px-4 py-2 text-ink-600">{r.confirmed ? t("yes") : t("no")}</td>
                  <td className="px-4 py-2 text-ink-600 tabular-nums">{shortDateTime(r.created_at, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
