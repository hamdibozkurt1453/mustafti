"use client";

import { m, useScroll, useSpring, useTransform } from "motion/react";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { Reveal } from "./Reveal";

const steps = ["s1", "s2", "s3"] as const;

/** «كيف يعمل»: ثلاث خطوات يربطها خط ذهبي يُرسم مع التمرير. */
export function HowItWorks({ reduced }: { reduced: boolean }) {
  const t = useTranslations("how");
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 80%", "end 55%"] });
  const smooth = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });
  const progress = useTransform(smooth, (v) => (reduced ? 1 : v));

  return (
    <section className="bg-ivory-50">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-green-600">{t("kicker")}</p>
          <h2 className="mt-3 font-display text-[34px] font-semibold leading-tight sm:text-6xl">{t("title")}</h2>
        </Reveal>

        <ol ref={ref} className="relative mt-14 grid gap-12 lg:mt-20 lg:grid-cols-3 lg:gap-10">
          {/* الخط: عمودي في الهاتف، أفقي في الحاسوب */}
          <span aria-hidden className="absolute bottom-6 start-6 top-6 w-px bg-sand-200 lg:hidden" />
          <m.span
            aria-hidden
            style={{ scaleY: progress }}
            className="absolute bottom-6 start-6 top-6 w-[2px] origin-top -translate-x-[0.5px] bg-gold-500 lg:hidden"
          />
          <span aria-hidden className="absolute end-[16.6%] start-[16.6%] top-6 hidden h-px bg-sand-200 lg:block" />
          <m.span
            aria-hidden
            style={{ scaleX: progress }}
            className="absolute end-[16.6%] start-[16.6%] top-6 hidden h-[2px] origin-left bg-gold-500 rtl:origin-right lg:block"
          />

          {steps.map((s, i) => (
            <li key={s} className="relative flex gap-5 lg:flex-col lg:items-center lg:text-center">
              <span className="relative z-10 flex h-12 w-12 flex-none items-center justify-center rounded-full bg-green-900 font-display text-lg font-semibold text-gold-500 ring-8 ring-ivory-50">
                {new Intl.NumberFormat(undefined).format(i + 1)}
              </span>
              <Reveal delay={i * 0.12} className="pt-1 lg:pt-4">
                <h3 className="font-display text-2xl font-semibold sm:text-[28px]">{t(`steps.${s}.title`)}</h3>
                <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-ink-600 sm:text-base">
                  {t(`steps.${s}.body`)}
                </p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
