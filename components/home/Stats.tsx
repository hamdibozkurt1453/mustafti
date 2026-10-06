"use client";

import { animate, useInView } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { GeometricPattern } from "./GeometricPattern";
import { Reveal } from "./Reveal";

/** رقم يعدّ من الصفر عند ظهوره. */
function CountUp({ to, reduced, locale }: { to: number; reduced: boolean; locale: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -15% 0px" });
  const [value, setValue] = useState(reduced ? to : 0);
  const fmt = new Intl.NumberFormat(locale);

  useEffect(() => {
    if (!inView || reduced || to === 0) return;
    const controls = animate(0, to, {
      duration: 1.8,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setValue(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, reduced, to]);

  return (
    <span ref={ref} className="tabular-nums">
      {fmt.format(value)}
    </span>
  );
}

/**
 * قسم «المعرفة من مصادرها، بلغات العالم» على الأخضر العميق.
 * F2: النقش الهندسي نفسه في الواجهة الأولى بانجراف خفيف جداً (mf-drift)، والأرقام تعدّ تصاعدياً عند الظهور،
 * والبطاقات الأربع بحدود رقيقة وظهور متدرج. مع prefers-reduced-motion: بلا حركة، والأرقام نهائية فوراً.
 */
export function Stats({ reduced }: { reduced: boolean }) {
  const t = useTranslations("stats");
  const locale = useLocale();
  const items = [
    { n: 56, label: t("quran") },
    { n: 72, label: t("hadith") },
    { n: 130, label: t("library") },
  ];
  const card = "flex flex-col gap-3 rounded-3xl border border-ivory-50/15 bg-green-900/60 p-5 backdrop-blur-[2px] transition-colors hover:border-gold-500/40 sm:p-8";

  return (
    <section data-testid="stats" className="relative isolate overflow-hidden bg-green-900 text-ivory-50">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.22] [mask-image:radial-gradient(ellipse_75%_70%_at_50%_45%,#000_30%,transparent_100%)]"
      >
        <GeometricPattern className="mf-drift h-full w-full" />
      </div>
      <div aria-hidden className="mf-grain pointer-events-none absolute inset-0 -z-10 opacity-[0.07]" />
      <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-500">{t("kicker")}</p>
          <h2 className="mt-3 max-w-2xl font-display text-[32px] font-semibold leading-tight sm:text-5xl">
            {t("title")}
          </h2>
        </Reveal>

        <dl className="mt-12 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {items.map((it, i) => (
            <Reveal key={it.label} delay={reduced ? 0 : 0.08 * (i + 1)} className={card}>
              <dt className="order-2 text-[13px] leading-snug text-ivory-50/75 sm:text-sm">{it.label}</dt>
              <dd className="order-1 font-display text-5xl font-semibold leading-none sm:text-7xl">
                <CountUp to={it.n} reduced={reduced} locale={locale} />
              </dd>
            </Reveal>
          ))}
          <Reveal delay={reduced ? 0 : 0.32} className={`${card} border-gold-500/30!`}>
            <dt className="order-2 text-[13px] leading-snug text-ivory-50/75 sm:text-sm">
              {t("fatwa")}
              <span className="mt-1 block font-semibold text-gold-500">{t("fatwaNote")}</span>
            </dt>
            <dd className="order-1 font-display text-5xl font-semibold leading-none text-gold-500 sm:text-7xl">
              <CountUp to={0} reduced={reduced} locale={locale} />
            </dd>
          </Reveal>
        </dl>
        <p className="mt-5 text-xs text-ivory-50/55">{t("source")}</p>
      </div>
    </section>
  );
}
