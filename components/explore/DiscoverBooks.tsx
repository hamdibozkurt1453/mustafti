import { getLocale, getTranslations } from "next-intl/server";
import { BookCard } from "@/components/library/BookCard";
import { Link } from "@/i18n/navigation";
import { discoverBooks } from "@/lib/explore/discover-books";
import { InView } from "./InView";
import { SectionHead } from "./SectionHead";

/**
 * F3: «كتب تجيب عن الأسئلة الكبرى» في /discover: ستة كتب من الواجهة البرمجية لـ IslamHouse
 * ببطاقات المكتبة نفسها (BookCard). تُرسم داخل Suspense فلا تؤخر المحادثة.
 */
export async function DiscoverBooks() {
  const locale = await getLocale();
  const [t, tl, books] = await Promise.all([getTranslations("explore"), getTranslations("library"), discoverBooks(locale)]);
  return (
    <InView as="section" className="mt-14">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHead kicker={t("booksKicker")} title={t("booksTitle")} lead={t("booksLead")} />
        <Link href="/library" className="mf-press inline-flex items-center gap-2 rounded-full border border-green-900/20 px-4 py-2 text-sm font-semibold text-green-900 hover:border-green-600 hover:bg-green-900/5">
          {t("booksMore")}
          <span aria-hidden className="rtl:-scale-x-100">→</span>
        </Link>
      </div>
      {books.length ? (
        <ul className="mf-stagger mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((b) => (
            <BookCard key={b.id} book={b} labels={{ pdf: tl("downloadPdf"), page: tl("islamhousePage"), by: tl("by") }} />
          ))}
        </ul>
      ) : (
        <p className="mt-6 rounded-2xl border border-dashed border-sand-200 bg-white p-6 text-center text-ink-600">{t("booksEmpty")}</p>
      )}
    </InView>
  );
}

/** هيكل التحميل: ست بطاقات باهتة. */
export function DiscoverBooksSkeleton() {
  return (
    <ul aria-hidden className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="h-72 animate-pulse rounded-[24px] border border-sand-200 bg-white" />
      ))}
    </ul>
  );
}
