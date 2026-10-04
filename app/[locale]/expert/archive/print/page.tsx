import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { AutoPrint } from "@/components/experts/AutoPrint";
import { ExpertGate } from "@/components/experts/ExpertGate";
import type { Locale } from "@/i18n/locales";
import { AuthzError, getAuthContext } from "@/lib/auth/roles";
import { CHAPTERS } from "@/lib/brain/prompts";
import { chapterAr, shortDateTime } from "@/lib/experts/format";
import { expertArchive, requireApprovedExpert, type ExpertSelf } from "@/lib/experts/store";
import { isAdminClientConfigured } from "@/lib/supabase/admin";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ chapter?: string }> };

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

/**
 * `/expert/archive/print` — أرشيف المختص للطباعة أو الحفظ PDF من المتصفح (window.print تلقائياً).
 * RTL وبخط الموقع، وفاصل صفحة بين المسائل. لكل مسألة: الباب، والتاريخ، والملخص، والأركان، وجواب المختص.
 * بلا أي بيانات للسائل. الرأس والتذييل وشريط الإفصاح تُخفى عند الطباعة.
 */
export default async function ArchivePrintPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout

  const ctx = await getAuthContext();
  if (!ctx.userId) redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/expert/archive/print`)}`);
  if (!isAdminClientConfigured()) return <ExpertGate status={null} />;

  let self: ExpertSelf;
  try {
    self = await requireApprovedExpert();
  } catch (error) {
    if (error instanceof AuthzError) return <ExpertGate status={ctx.expertStatus} />;
    throw error;
  }

  const sp = await searchParams;
  const chapter = (CHAPTERS as readonly string[]).includes(sp.chapter ?? "") ? sp.chapter : undefined;
  const items = await expertArchive(self, { chapter }, 1000);
  const t = await getTranslations("experts.dashboard");
  const uiLocale = await getLocale();

  return (
    <main dir="rtl" lang="ar" className="mx-auto w-full max-w-3xl flex-1 bg-white px-6 py-8 text-green-900 print:max-w-none print:p-0">
      <style>{`
        @page { size: A4; margin: 18mm 16mm; }
        @media print {
          body > header, footer, [role="note"] { display: none !important; }
          body { background: #fff !important; }
          .print-case { break-after: page; page-break-after: always; }
          .print-case:last-child { break-after: auto; page-break-after: auto; }
          .print-case table, .print-case section { break-inside: avoid; }
        }
      `}</style>
      <AutoPrint />
      <h1 className="mb-6 border-b-2 border-gold-500 pb-3 text-2xl font-bold print:mb-4">
        {t("archiveTitle")} <span className="text-base font-normal text-ink-600">({items.length})</span>
      </h1>
      {!items.length && <p className="text-ink-600">{t("archiveEmpty")}</p>}
      {items.map((c, i) => (
        <article key={c.id} className="print-case mb-10 space-y-4 border-b border-sand-200 pb-8 print:mb-0 print:border-0 print:pb-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-bold">
              <bdi>{i + 1}</bdi>. <bdi>{chapterAr(c.chapter)}</bdi>
            </h2>
            <p className="text-sm text-ink-600">
              {t("sentAt")}: <bdi>{shortDateTime(c.createdAt, uiLocale)}</bdi> · {t("answeredAt")}: <bdi>{shortDateTime(c.answeredAt, uiLocale)}</bdi>
            </p>
          </div>
          <section>
            <h3 className="mb-1 text-sm font-semibold text-green-600">{t("summary")}</h3>
            <p className="whitespace-pre-wrap leading-relaxed">{c.summaryAr}</p>
          </section>
          {c.rows.length > 0 && (
            <section>
              <h3 className="mb-1 text-sm font-semibold text-green-600">{t("pillars")}</h3>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {c.rows.map((r) => (
                    <tr key={r.key} className="border border-sand-200">
                      <th scope="row" className="w-1/2 bg-ivory-50 px-3 py-1.5 text-start font-normal text-ink-600">
                        {r.labelAr || r.label}
                      </th>
                      <td className="px-3 py-1.5 font-semibold">{r.valueAr || r.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          <section>
            <h3 className="mb-1 text-sm font-semibold text-green-600">{t("yourAnswer")}</h3>
            <p className="whitespace-pre-wrap leading-loose">{c.answerAr}</p>
          </section>
        </article>
      ))}
    </main>
  );
}
