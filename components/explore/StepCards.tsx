import { getLocale, getTranslations } from "next-intl/server";
import { InView } from "./InView";
import { SectionHead } from "./SectionHead";

export const FIRST_STEPS = ["shahada", "purity", "prayer", "fasting", "quran", "character"] as const;

/** أيقونات خطية بهوية الموقع لكل خطوة. */
const ICONS: Record<(typeof FIRST_STEPS)[number], React.ReactNode> = {
  shahada: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />,
  purity: <path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11zM9.5 15a2.5 2.5 0 0 0 2.5 2.5" />,
  prayer: <path d="M4 20h16M6 20V11l6-5 6 5v9M10 20v-5a2 2 0 0 1 4 0v5M12 3v3" />,
  fasting: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5zM16 4l.7 1.6L18.3 6l-1.6.7L16 8.3l-.7-1.6L13.7 6l1.6-.4z" />,
  quran: <path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5M12 6.5C14 5 17 4.5 20 5v13c-3-.5-6 0-8 1.5M12 6.5v13" />,
  character: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
};

/**
 * F3: «خطواتك الأولى» في /new-muslim: ست بطاقات، كل بطاقة تفتح محادثة «المرشد» بسؤالها (?q=).
 * رابط عادي (تحميل كامل) لأن GuidedChat يقرأ ?q= عند التحميل، والسائل يرسل السؤال بنفسه.
 */
export async function StepCards() {
  const t = await getTranslations("explore");
  const locale = await getLocale();
  return (
    <InView as="section" className="mt-14">
      <SectionHead kicker={t("stepsKicker")} title={t("stepsTitle")} lead={t("stepsLead")} />
      <ul className="mf-stagger mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FIRST_STEPS.map((k, i) => (
          <li key={k}>
            <a
              href={`/${locale}/new-muslim?q=${encodeURIComponent(t(`steps.${k}.q`))}`}
              className="mf-lift group relative flex h-full flex-col overflow-hidden rounded-[24px] border border-sand-200 bg-white p-5 hover:border-green-600/40"
            >
              <span aria-hidden className="absolute -end-6 -top-6 h-24 w-24 rounded-full bg-gold-500/10 transition-transform duration-500 group-hover:scale-150" />
              <span className="relative flex items-center gap-3">
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-green-900 text-gold-500">
                  <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    {ICONS[k]}
                  </svg>
                </span>
                <span className="font-display text-sm font-semibold text-green-600 tabular-nums">{new Intl.NumberFormat(locale).format(i + 1)}</span>
              </span>
              <h3 className="relative mt-4 text-lg font-semibold text-green-900">{t(`steps.${k}.title`)}</h3>
              <p className="relative mt-1 flex-1 text-sm leading-relaxed text-ink-600">{t(`steps.${k}.body`)}</p>
              <span className="relative mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-green-600 transition-all group-hover:gap-2.5">
                {t("askCta")}
                <span aria-hidden className="rtl:-scale-x-100">→</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </InView>
  );
}
