import { useTranslations } from "next-intl";

const keys = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11", "s12"] as const;

/** شريط «يجيب من»: أسماء المصادر المعتمدة من المرجعية، تتحرك بلا توقف (وتتوقف عند المرور). */
export function SourcesMarquee() {
  const t = useTranslations("sources");
  const items = keys.map((k) => t(`items.${k}`));

  const row = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className={`flex flex-none items-center ${hidden ? "mf-marquee-dup" : ""}`}>
      {items.map((name, i) => (
        <li key={i} className="flex items-center whitespace-nowrap">
          <span className="font-display text-lg text-ivory-50/90 sm:text-xl">{name}</span>
          <svg viewBox="0 0 20 20" aria-hidden className="mx-6 h-3 w-3 flex-none text-gold-500 sm:mx-8">
            <path fill="currentColor" d="M10 0l2.5 7.5L20 10l-7.5 2.5L10 20l-2.5-7.5L0 10l7.5-2.5z" />
          </svg>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="relative border-t border-ivory-50/10 bg-green-900/60 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[100vw] items-center">
        <p className="relative z-10 flex-none bg-green-900 px-4 py-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-500 sm:px-6 sm:text-xs">
          {t("title")}
        </p>
        <div className="mf-marquee-wrap relative min-w-0 flex-1 overflow-hidden py-4 [mask-image:linear-gradient(to_right,transparent,#000_48px,#000_calc(100%-48px),transparent)]">
          <div className="mf-marquee flex w-max">
            {row(false)}
            {row(true)}
          </div>
        </div>
      </div>
    </div>
  );
}
