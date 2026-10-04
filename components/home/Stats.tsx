"use client";

import { animate, useInView } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
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

/** قسم الأرقام على الأخضر العميق. */
export function Stats({ reduced }: { reduced: boolean }) {
  const t = useTranslations("stats");
  const locale = useLocale();
  const items = [
    { n: 56, label: t("quran") },
    { n: 72, label: t("hadith") },
    { n: 130, label: t("library") },
  ];

  return (
    <section className="relative isolate overflow-hidden bg-green-900 text-ivory-50">
      <div aria-hidden className="mf-grain pointer-events-none absolute inset-0 -z-10 opacity-[0.07]" />
      <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-500">{t("kicker")}</p>
          <h2 className="mt-3 max-w-2xl font-display text-[32px] font-semibold leading-tight sm:text-5xl">
            {t("title")}
          </h2>
        </Reveal>

        <dl className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-3xl bg-ivory-50/10 lg:grid-cols-4">
          {items.map((it) => (
            <div key={it.label} className="flex flex-col gap-2 bg-green-900 p-5 sm:p-8">
              <dt className="order-2 text-[13px] leading-snug text-ivory-50/75 sm:text-sm">{it.label}</dt>
              <dd className="order-1 font-display text-5xl font-semibold leading-none sm:text-7xl">
                <CountUp to={it.n} reduced={reduced} locale={locale} />
              </dd>
            </div>
          ))}
          <div className="flex flex-col gap-2 bg-green-900 p-5 sm:p-8">
            <dt className="order-2 text-[13px] leading-snug text-ivory-50/75 sm:text-sm">
              {t("fatwa")}
              <span className="mt-1 block font-semibold text-gold-500">{t("fatwaNote")}</span>
            </dt>
            <dd className="order-1 font-display text-5xl font-semibold leading-none text-gold-500 sm:text-7xl">
              <CountUp to={0} reduced={reduced} locale={locale} />
            </dd>
          </div>
        </dl>
        <p className="mt-5 text-xs text-ivory-50/55">{t("source")}</p>
      </div>
    </section>
  );
}
