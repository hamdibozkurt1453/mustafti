import type { Metadata } from "next";
import { connection } from "next/server";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { CaseFileView, CaseStatusBadge } from "@/components/case/CaseFileView";
import { AnswerCard } from "@/components/experts/AnswerCard";
import { placeholderMetadata } from "@/components/PagePlaceholder";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/locales";
import { getCaseByToken } from "@/lib/case/store";
import { answerCards } from "@/lib/experts/store";
import { dirForText } from "@/lib/chat/protocol";
import { isAdminClientConfigured } from "@/lib/supabase/admin";

type Props = { params: Promise<{ locale: string; token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  // رابط الملف سري: لا يُفهرس، ولا يُرسل في ترويسة Referer إلى مواقع أخرى.
  return {
    ...(await placeholderMetadata(locale, "case")),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

const STEPS = ["submitted", "assigned", "answered"] as const;

/**
 * `/case/[رمز]` — متابعة ملف المسألة لصاحب الرابط: الحالة، والملف كما أُرسل، وجواب المختص
 * (العربي كما كتبه، ثم الترجمة الآلية تحته). لا يُعرض اسم المختص ولا بريده.
 */
export default async function CasePage({ params }: Props) {
  const { locale, token } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout
  await connection(); // يُرسم لكل طلب: الحالة تتغير

  const t = await getTranslations("caseFile");
  const pages = await getTranslations("pages");
  const format = await getFormatter();
  const view = isAdminClientConfigured() ? await getCaseByToken(decodeURIComponent(token)) : null;
  const cards = view ? await answerCards(view.answers.map((a) => a.expertId)) : new Map();

  if (!view) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
        <h1 className="text-[28px] font-bold leading-snug sm:text-[36px]">{t("notFoundTitle")}</h1>
        <p className="mt-3 text-ink-600">{t("notFoundLead")}</p>
        <Link href="/" className="mt-6 inline-block font-semibold text-green-600 underline underline-offset-4">
          {pages("backHome")}
        </Link>
      </main>
    );
  }

  const reached = view.status === "closed" ? STEPS.length : STEPS.indexOf(view.status as (typeof STEPS)[number]) + 1;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
      <h1 className="text-[28px] font-bold leading-snug sm:text-[36px]">{pages("case.title")}</h1>
      <p className="mt-2 text-sm text-ink-600">{t("privacy")}</p>

      <section className="mt-6 rounded-[22px] border border-sand-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-600">
            {t("status")}: <CaseStatusBadge status={view.status} />
          </p>
          <p className="text-sm text-ink-600">
            {t("sentAt")}: {format.dateTime(new Date(view.createdAt), { dateStyle: "medium", timeStyle: "short" })}
          </p>
        </div>
        <ol className="mt-4 grid grid-cols-3 gap-2" aria-label={t("status")}>
          {STEPS.map((step, i) => (
            <li key={step} className="text-center">
              <span className={`block h-1.5 rounded-full ${i < reached ? "bg-gold-500" : "bg-sand-200"}`} />
              <span className={`mt-1.5 block text-[11px] ${i < reached ? "font-semibold text-green-900" : "text-ink-600"}`}>
                {t(`statuses.${step}`)}
              </span>
            </li>
          ))}
        </ol>
        {view.routeTo && (
          <p className="mt-4 text-sm text-ink-600">
            {t("routedTo")}: <span className="font-semibold text-green-900">{t(`routes.${view.routeTo}`)}</span>
          </p>
        )}
      </section>

      <section className="mt-6 rounded-[22px] border border-sand-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-bold">{t("answerTitle")}</h2>
        {view.answers.length ? (
          <div className="space-y-4">
            {view.answers.map((a, i) => (
              <article key={i} className="space-y-3">
                <div>
                  <p className="mb-1 text-[11px] font-semibold text-green-600">{t("answerOriginal")}</p>
                  <p dir="rtl" lang="ar" className="whitespace-pre-wrap leading-relaxed">
                    {a.answerAr}
                  </p>
                </div>
                {a.answerTranslated && (
                  <div className="rounded-xl bg-ivory-50 p-3">
                    <p className="mb-1 text-[11px] font-semibold text-green-600">{t("answerTranslated")}</p>
                    <p dir={dirForText(a.answerTranslated)} className="whitespace-pre-wrap leading-relaxed">
                      {a.answerTranslated}
                    </p>
                  </div>
                )}
                {cards.get(a.expertId) && <AnswerCard card={cards.get(a.expertId)!} />}
              </article>
            ))}
          </div>
        ) : (
          <p className="text-ink-600">{t("waiting")}</p>
        )}
      </section>

      <section className="mt-6 rounded-[22px] border border-sand-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-bold">{t("fileTitle")}</h2>
        <CaseFileView
          locale={locale}
          chapter={view.chapter}
          question={view.question}
          summaryAr={view.summaryAr}
          summaryUser={view.summaryUser}
          rows={view.rows}
          unknowns={view.unknowns}
        />
      </section>
    </main>
  );
}
