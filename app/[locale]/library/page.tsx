import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { localeNames, type Locale } from "@/i18n/locales";
import { cleanQuery, LIBRARY_TOPICS, shamelaSearchUrl } from "@/lib/library/items";
import { searchLibrary } from "@/lib/library/search";
import { checkRateLimit } from "@/lib/rate-limit";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
};

/** حد البحث لكل عنوان IP: 60 بحثاً في الساعة (والنتائج مخزّنة 24 ساعة على أي حال). */
const LIBRARY_LIMIT_PER_HOUR = 60;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "library" });
  return { title: t("title"), description: t("lead") };
}

/**
 * `/library` — «المكتبة» (R2): كتب ومواد مجانية من IslamHouse بلغة الواجهة عبر خادم MCP.
 * البحث نموذج GET (?q=)، فالرابط قابل للمشاركة ويعمل بلا JavaScript. لا ننسخ ملفاً ولا نستضيفه:
 * كل بطاقة تفتح رابطها الرسمي على islamhouse.com، وزر الشاملة رابط بحث فقط.
 */
export default async function LibraryPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout
  const t = await getTranslations("library");
  const q = cleanQuery((await searchParams).q);

  let cards: Awaited<ReturnType<typeof searchLibrary>> = [];
  let limited = false;
  if (q) {
    const rate = await checkRateLimit("library", await headers(), LIBRARY_LIMIT_PER_HOUR, 3600);
    if (rate.ok) cards = await searchLibrary(q, locale);
    else limited = true;
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:py-14">
      <section className="mf-stagger relative isolate overflow-hidden rounded-[32px] bg-green-900 p-6 text-ivory-50 sm:p-10">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{ background: "radial-gradient(60% 80% at 85% 10%, rgb(255 184 0 / 0.14), transparent 70%), radial-gradient(80% 70% at 0% 100%, rgb(10 107 69 / 0.7), transparent 70%)" }}
        />
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-500">{t("kicker")}</p>
        <h1 className="mt-3 font-display text-[32px] font-semibold leading-tight sm:text-5xl">{t("title")}</h1>
        <p className="mt-3 max-w-2xl text-ivory-50/80 sm:text-[17px]">{t("lead")}</p>

        <form action="" method="get" role="search" className="mt-7 flex max-w-2xl gap-2">
          <label htmlFor="library-q" className="sr-only">{t("searchLabel")}</label>
          <input
            id="library-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder={t("placeholder")}
            maxLength={120}
            className="min-w-0 flex-1 rounded-full border border-ivory-50/15 bg-ivory-50/[0.08] px-5 py-3 text-ivory-50 outline-none transition-colors placeholder:text-ivory-50/50 focus:border-gold-500"
          />
          <button type="submit" className="mf-press flex-none rounded-full bg-gold-500 px-6 py-3 font-semibold text-green-900 hover:brightness-105">
            {t("search")}
          </button>
        </form>

        <ul className="mt-5 flex flex-wrap gap-2" aria-label={t("topicsLabel")}>
          {LIBRARY_TOPICS.map((topic) => {
            const label = t(`topics.${topic}`);
            const active = q === label;
            return (
              <li key={topic}>
                <Link
                  href={{ pathname: "/library", query: { q: label } }}
                  aria-current={active ? "true" : undefined}
                  className={`mf-press inline-block rounded-full border px-4 py-1.5 text-sm transition-colors ${
                    active
                      ? "border-gold-500 bg-gold-500 font-semibold text-green-900"
                      : "border-ivory-50/20 text-ivory-50/90 hover:border-gold-500/70 hover:text-ivory-50"
                  }`}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {q && (
        <section aria-live="polite" className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-green-900">{t("resultsFor", { q })}</h2>
            <a
              href={shamelaSearchUrl(q)}
              target="_blank"
              rel="noopener noreferrer"
              className="mf-press inline-flex items-center gap-2 rounded-full border border-green-900/20 px-4 py-2 text-sm font-semibold text-green-900 hover:border-green-600 hover:bg-green-900/5"
            >
              {t("shamela")}
              <span aria-hidden>↗</span>
            </a>
          </div>

          {limited ? (
            <p className="mt-6 rounded-2xl border border-dashed border-sand-200 bg-white p-6 text-center text-ink-600">{t("limited")}</p>
          ) : cards === null ? (
            <p className="mt-6 rounded-2xl border border-dashed border-sand-200 bg-white p-6 text-center text-ink-600">{t("unavailable")}</p>
          ) : cards.length === 0 ? (
            <p className="mt-6 rounded-2xl border border-dashed border-sand-200 bg-white p-6 text-center text-ink-600">{t("empty")}</p>
          ) : (
            <ul className="mf-stagger mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((c) => (
                <li key={c.url} className="mf-lift flex flex-col rounded-[24px] border border-sand-200 bg-white p-5 hover:border-green-600/40">
                  <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                    <span className="rounded-full bg-green-900/[0.06] px-2.5 py-1 text-green-600">{t(`types.${c.type}`)}</span>
                    {c.lang && (
                      <span className="rounded-full bg-gold-50 px-2.5 py-1 text-green-900">
                        {localeNames[c.lang as Locale] ?? c.lang.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <h3 dir="auto" className="mt-3 line-clamp-3 font-semibold leading-snug text-green-900">{c.title}</h3>
                  {c.text && c.text !== c.title && (
                    <p dir="auto" className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-600">{c.text}</p>
                  )}
                  <div className="mt-auto pt-4">
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mf-press inline-flex items-center gap-2 rounded-full bg-green-900 px-4 py-2 text-sm font-semibold text-ivory-50 hover:bg-green-600"
                    >
                      {t("open")}
                      <span aria-hidden>↗</span>
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-6 text-xs text-ink-600">{t("note")}</p>
        </section>
      )}

      {!q && <p className="mt-6 text-sm text-ink-600">{t("hint")}</p>}
    </main>
  );
}
