import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthorLine } from "@/components/forum/ForumBits";
import { Link } from "@/i18n/navigation";
import { PAGE_WIDTH, PageHero } from "@/components/PageHero";
import { localeNames, type Locale } from "@/i18n/locales";
import { getAuthContext } from "@/lib/auth/roles";
import { shortDateTime } from "@/lib/experts/format";
import { activeCategories, categoryName } from "@/lib/forum/category-rules";
import { listCategories } from "@/lib/forum/categories";
import { isForumCategory } from "@/lib/forum/rules";
import { listThreads } from "@/lib/forum/store";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ cat?: string | string[]; q?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "forum" });
  return { title: t("title"), description: t("lead") };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * `/forum` — «الحوار» (R4): قائمة المواضيع (المثبّتة أولاً ثم الأحدث نشاطاً)، وفلتر الباب (?cat=)،
 * والبحث بالعنوان (?q=، نموذج GET يعمل بلا JavaScript)، وزر «موضوع جديد» (يطلب الدخول).
 * القراءة بجلسة الزائر أو المستخدم (RLS: الظاهر والمقفل فقط).
 */
export default async function ForumPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout
  const t = await getTranslations("forum");
  const sp = await searchParams;
  const cat = isForumCategory(one(sp.cat)) ? one(sp.cat) : null;
  const q = one(sp.q).trim().slice(0, 100);

  const [ctx, threads, categories] = await Promise.all([getAuthContext(), listThreads({ category: cat, q }), listCategories()]);
  // F3: الأبواب من جدول forum_categories (المفعّلة في الفلتر، وأسماء كل الأبواب لشارات المواضيع القديمة).
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const catName = (slug: string) => categoryName(bySlug.get(slug), locale, slug);
  const signedIn = Boolean(ctx.userId);
  const newHref = signedIn ? `/${locale}/forum/new` : `/${locale}/login?next=${encodeURIComponent(`/${locale}/forum/new`)}`;

  const chip = (active: boolean) =>
    `mf-press inline-block whitespace-nowrap rounded-full border px-4 py-1.5 text-sm transition-colors ${
      active ? "border-gold-500 bg-gold-500 font-semibold text-green-900" : "border-ivory-50/20 text-ivory-50/90 hover:border-gold-500/70 hover:text-ivory-50"
    }`;
  const filterHref = (c: string | null) => ({ pathname: "/forum" as const, query: { ...(c ? { cat: c } : {}), ...(q ? { q } : {}) } });

  return (
    <main className="flex-1">
      {/* F5: هيرو بعرض الشاشة بنقش /about، والمحتوى تحته بعرض 1200px. */}
      <PageHero>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-500">{t("kicker")}</p>
            <h1 className="mt-3 font-display text-[32px] font-semibold leading-tight sm:text-5xl">{t("title")}</h1>
            <p className="mt-3 text-ivory-50/80 sm:text-[17px]">{t("lead")}</p>
          </div>
          <a
            href={newHref}
            className="mf-press inline-flex flex-none items-center gap-2 rounded-full bg-gold-500 px-5 py-3 font-semibold text-green-900 hover:brightness-105"
            title={signedIn ? undefined : t("loginToPost")}
          >
            <span aria-hidden>+</span>
            {t("newThread")}
          </a>
        </div>

        <form action="" method="get" role="search" className="mt-7 flex max-w-2xl gap-2">
          {cat && <input type="hidden" name="cat" value={cat} />}
          <label htmlFor="forum-q" className="sr-only">
            {t("searchLabel")}
          </label>
          <input
            id="forum-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder={t("searchPlaceholder")}
            maxLength={100}
            className="min-w-0 flex-1 rounded-full border border-ivory-50/15 bg-ivory-50/[0.08] px-5 py-3 text-ivory-50 outline-none transition-colors placeholder:text-ivory-50/50 focus:border-gold-500"
          />
          <button type="submit" className="mf-press flex-none rounded-full bg-ivory-50 px-5 py-3 font-semibold text-green-900 hover:bg-gold-500">
            {t("searchButton")}
          </button>
        </form>

        <nav aria-label={t("categoryFilter")} className="mf-no-scrollbar -mx-6 mt-5 overflow-x-auto px-6 sm:mx-0 sm:px-0">
          <ul className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
            <li>
              <Link href={filterHref(null)} aria-current={!cat ? "true" : undefined} className={chip(!cat)}>
                {t("allCategories")}
              </Link>
            </li>
            {activeCategories(categories).map(({ slug: c }) => (
              <li key={c}>
                <Link href={filterHref(c)} aria-current={cat === c ? "true" : undefined} className={chip(cat === c)}>
                  {catName(c)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </PageHero>

      <div className={`${PAGE_WIDTH} pb-14 pt-2`}>

      <p className="mt-6 rounded-2xl border border-sand-200 bg-white px-5 py-3 text-sm text-ink-600">
        <strong className="text-green-900">{t("rulesTitle")}: </strong>
        {t("rules")}
      </p>

      {threads.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-sand-200 bg-white p-8 text-center text-ink-600">{q || cat ? t("emptySearch") : t("empty")}</p>
      ) : (
        <ul className="mf-stagger mt-6 space-y-3">
          {threads.map((th) => (
            <li key={th.id}>
              <article className={`mf-lift relative rounded-[24px] border bg-white p-5 transition-colors hover:border-green-600/40 ${th.pinned ? "border-gold-500" : "border-sand-200"}`}>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                  {th.pinned && <span className="rounded-full bg-gold-500 px-2.5 py-1 text-green-900">📌 {t("pinned")}</span>}
                  {th.status === "locked" && <span className="rounded-full bg-green-900 px-2.5 py-1 text-ivory-50">🔒 {t("locked")}</span>}
                  <span className="rounded-full bg-green-900/[0.06] px-2.5 py-1 text-green-600">{catName(th.category)}</span>
                  {th.lang !== locale && localeNames[th.lang as Locale] && (
                    <span className="rounded-full bg-gold-50 px-2.5 py-1 text-green-900">{localeNames[th.lang as Locale]}</span>
                  )}
                </div>
                <h2 dir="auto" className="mt-3 text-lg font-semibold leading-snug text-green-900">
                  <Link href={`/forum/${th.id}`} className="after:absolute after:inset-0 hover:text-green-600">
                    {th.title}
                  </Link>
                </h2>
                <div className="relative z-10 mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-600">
                  <AuthorLine author={th.author} size={26} />
                  <span className="flex flex-wrap items-center gap-3 tabular-nums">
                    <span>{t("replies", { count: th.repliesCount })}</span>
                    <span>
                      {t("lastActivity")}: {shortDateTime(th.lastActivityAt, locale)}
                    </span>
                  </span>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
      </div>
    </main>
  );
}
