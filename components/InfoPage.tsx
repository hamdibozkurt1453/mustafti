import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PAGE_WIDTH, PageHero } from "@/components/PageHero";
import { pageContent, type InfoPage as InfoPageKey } from "@/lib/pages/content";

/**
 * F1: صفحات المعلومات (/about و/eval و/privacy) بمحتوى حقيقي من lib/pages/content.ts:
 * العنوان والوصف من messages (pages.*)، ثم الأقسام بفقراتها وقوائمها وروابطها.
 */
export async function InfoPage({ page, locale, children }: { page: InfoPageKey; locale: string; children?: ReactNode }) {
  const t = await getTranslations("pages");
  const content = pageContent(locale, page);
  return (
    <main className="flex-1">
      {/* F5: هيرو بعرض الشاشة بنقش /about، والمحتوى تحته بعرض 1200px. */}
      <PageHero>
      <h1 className="font-display text-[30px] font-semibold leading-snug sm:text-[42px]">{t(`${page}.title`)}</h1>
      <p className="mt-3 max-w-3xl text-ivory-50/85 sm:text-[17px]">{t(`${page}.description`)}</p>
      {content.updated && <p className="mt-2 text-sm font-semibold text-gold-500">{content.updated}</p>}
      {/* F1b: زر في أعلى الصفحة (المستودع في /eval). */}
      {content.topLink && (
        <a
          href={content.topLink.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mf-press mt-5 inline-flex items-center gap-2 rounded-full bg-gold-500 px-5 py-2.5 text-sm font-semibold text-green-900 hover:brightness-105"
        >
          {content.topLink.label}
          <span aria-hidden>↗</span>
        </a>
      )}
      </PageHero>
      <div className={`mf-stagger ${PAGE_WIDTH} space-y-5 pb-14 pt-8`}>
        {content.sections.map((section) => (
          <section key={section.title} className="rounded-[24px] border border-sand-200 bg-white p-6 sm:p-8">
            <h2 className="text-xl font-bold text-green-900">{section.title}</h2>
            {section.paras?.map((p) => (
              <p key={p} className="mt-3 leading-relaxed text-ink-600">{p}</p>
            ))}
            {section.items && (
              <ul className="mt-4 space-y-2.5">
                {section.items.map((item) => (
                  <li key={item} className="flex gap-3 leading-relaxed text-green-900/90">
                    <span aria-hidden className="mt-2.5 size-1.5 flex-none rounded-full bg-gold-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
            {section.link &&
              (/^(https?:|mailto:)/.test(section.link.href) ? (
                <a
                  href={section.link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mf-press mt-5 inline-flex items-center gap-2 rounded-full bg-green-900 px-5 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-green-600"
                >
                  {section.link.label}
                  <span aria-hidden>↗</span>
                </a>
              ) : (
                <Link
                  href={section.link.href}
                  className="mf-press mt-5 inline-flex items-center gap-2 rounded-full border border-green-900/20 px-5 py-2.5 text-sm font-semibold text-green-900 hover:border-green-600 hover:bg-green-900/5"
                >
                  {section.link.label}
                  <span aria-hidden className="rtl:-scale-x-100">→</span>
                </Link>
              ))}
          </section>
        ))}
        {children}
      </div>
    </main>
  );
}
