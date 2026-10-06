import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookCard } from "@/components/library/BookCard";
import { LoadMoreBooks } from "@/components/library/LoadMoreBooks";
import { Link } from "@/i18n/navigation";
import { PAGE_WIDTH, PageHero } from "@/components/PageHero";
import type { Locale } from "@/i18n/locales";
import { latestBooks, searchBooks, topicBooks } from "@/lib/library/islamhouse";
import { IslamhouseError, isTopicKey, LIBRARY_TOPIC_KEYS, type BookCard as Book } from "@/lib/library/islamhouse-core";
import { cleanQuery } from "@/lib/library/items";
import { checkRateLimit } from "@/lib/rate-limit";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[]; topic?: string | string[]; lang?: string | string[] }>;
};

/** حد البحث بالكلمة لكل عنوان IP: 60 بحثاً في الساعة (والكتب مخزّنة 24 ساعة على أي حال). */
const LIBRARY_LIMIT_PER_HOUR = 60;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "library" });
  return { title: t("title"), description: t("lead") };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * `/library` — «المكتبة» (F1b): كتب IslamHouse المجانية من واجهته البرمجية الرسمية، بلغة الواجهة
 * (أو بالعربية بزر «كتب بالعربية أيضاً»: ?lang=ar). التصنيفات (?topic=) مربوطة بشجرة تصنيفات IslamHouse،
 * والبحث (?q=) فلترة محلية لأحدث 200 كتاب. كل طلب بمهلة 8 ثوانٍ.
 * F2: 6 كتب فقط في البداية (القائمة الافتراضية والتصنيف والبحث)، و«اكتشف المزيد» يضيف 6 في كل ضغطة (/api/library).
 */
export default async function LibraryPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout
  const t = await getTranslations("library");
  const sp = await searchParams;
  const q = cleanQuery(one(sp.q));
  const rawTopic = one(sp.topic) ?? "";
  const topic = !q && isTopicKey(rawTopic) ? rawTopic : null;
  const arabic = locale !== "ar" && one(sp.lang) === "ar";
  const lang = arabic ? "ar" : locale;

  let books: Book[] = [];
  let hasMore = false;
  let error: "limited" | "timeout" | "unavailable" | null = null;
  try {
    if (q) {
      const rate = await checkRateLimit("library", await headers(), LIBRARY_LIMIT_PER_HOUR, 3600);
      if (rate.ok) ({ books, hasMore } = await searchBooks(q, lang));
      else error = "limited";
    } else if (topic) {
      ({ books, hasMore } = await topicBooks(topic, lang));
    } else {
      ({ books, hasMore } = await latestBooks(lang));
    }
  } catch (e) {
    console.error("library:", e instanceof Error ? e.message : e);
    error = e instanceof IslamhouseError && e.kind === "timeout" ? "timeout" : "unavailable";
  }

  const heading = q ? t("resultsFor", { q }) : topic ? t(`topics.${topic}`) : t("latest");
  // روابط الصفحة تحفظ اختيار اللغة العربية.
  const withLang = (query: Record<string, string>) => (arabic ? { ...query, lang: "ar" } : query);
  const cardLabels = { pdf: t("downloadPdf"), by: t("by") };

  return (
    <main className="flex-1">
      {/* F5: هيرو بعرض الشاشة بنقش /about، والمحتوى تحته بعرض 1200px. */}
      <PageHero>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-500">{t("kicker")}</p>
        <h1 className="mt-3 font-display text-[32px] font-semibold leading-tight sm:text-5xl">{t("title")}</h1>
        <p className="mt-3 max-w-2xl text-ivory-50/80 sm:text-[17px]">{t("lead")}</p>

        <form action="" method="get" role="search" className="mt-7 flex max-w-2xl gap-2">
          {arabic && <input type="hidden" name="lang" value="ar" />}
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
          {LIBRARY_TOPIC_KEYS.map((key) => {
            const active = topic === key;
            return (
              <li key={key}>
                <Link
                  href={{ pathname: "/library", query: withLang({ topic: key }) }}
                  aria-current={active ? "true" : undefined}
                  className={`mf-press inline-block rounded-full border px-4 py-1.5 text-sm transition-colors ${
                    active
                      ? "border-gold-500 bg-gold-500 font-semibold text-green-900"
                      : "border-ivory-50/20 text-ivory-50/90 hover:border-gold-500/70 hover:text-ivory-50"
                  }`}
                >
                  {t(`topics.${key}`)}
                </Link>
              </li>
            );
          })}
        </ul>
      </PageHero>

      <div className={`${PAGE_WIDTH} pb-14 pt-2`}>

      <section aria-live="polite" className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-green-900">{heading}</h2>
          {locale !== "ar" && (
            <Link
              href={{
                pathname: "/library",
                query: { ...(q ? { q } : topic ? { topic } : {}), ...(arabic ? {} : { lang: "ar" }) },
              }}
              className="mf-press inline-flex items-center gap-2 rounded-full border border-green-900/20 px-4 py-2 text-sm font-semibold text-green-900 hover:border-green-600 hover:bg-green-900/5"
            >
              {arabic ? t("ownLanguage") : t("arabicToo")}
            </Link>
          )}
        </div>

        {error ? (
          <p role="alert" className="mt-6 rounded-2xl border border-dashed border-sand-200 bg-white p-6 text-center text-ink-600">
            {t(error)}
          </p>
        ) : books.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-sand-200 bg-white p-6 text-center text-ink-600">{t("empty")}</p>
        ) : (
          <>
            <ul className="mf-stagger mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {books.map((book) => (
                <BookCard key={book.id} book={book} labels={cardLabels} />
              ))}
            </ul>
            <LoadMoreBooks
              key={`${lang}|${topic ?? ""}|${q}`}
              initialHasMore={hasMore}
              query={{ lang, ...(q ? { q } : topic ? { topic } : {}) }}
              shownIds={books.map((b) => b.id)}
              labels={{ ...cardLabels, more: t("more"), loading: t("loadingMore"), error: t("moreError") }}
            />
          </>
        )}
      </section>
      </div>
    </main>
  );
}
