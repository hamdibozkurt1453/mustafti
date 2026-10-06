import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { pageContent, type InfoPage as InfoPageKey } from "@/lib/pages/content";

/**
 * F1: صفحات المعلومات (/about و/eval و/privacy) بمحتوى حقيقي من lib/pages/content.ts:
 * العنوان والوصف من messages (pages.*)، ثم الأقسام بفقراتها وقوائمها وروابطها.
 */
export async function InfoPage({ page, locale, children }: { page: InfoPageKey; locale: string; children?: ReactNode }) {
  const t = await getTranslations("pages");
  const content = pageContent(locale, page);
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
      <h1 className="font-display text-[30px] font-semibold leading-snug text-green-900 sm:text-[42px]">{t(`${page}.title`)}</h1>
      <p className="mt-3 text-ink-600 sm:text-[17px]">{t(`${page}.description`)}</p>
      <div className="mf-stagger mt-8 space-y-5">
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
              (section.link.href.startsWith("http") ? (
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
