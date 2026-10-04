"use client";

import { m, useMotionValue, useSpring, useTransform } from "motion/react";
import { useTranslations } from "next-intl";
import type { PointerEvent, ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import type { Persona } from "./Hero";
import { Reveal } from "./Reveal";

type CardProps = {
  tone: "dark" | "gold" | "light";
  kicker: string;
  title: string;
  body: string;
  cta: string;
  ornament: ReactNode;
  reduced: boolean;
};

/** بطاقة تميل قليلاً مع المؤشر. */
function TiltCard({ tone, kicker, title, body, cta, ornament, reduced }: CardProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [5, -5]), { stiffness: 200, damping: 20 });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-6, 6]), { stiffness: 200, damping: 20 });

  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (reduced || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - r.left) / r.width - 0.5);
    y.set((e.clientY - r.top) / r.height - 0.5);
  }
  function onLeave() {
    x.set(0);
    y.set(0);
  }

  const tones = {
    dark: "bg-green-900 text-ivory-50",
    gold: "bg-gold-500 text-green-900",
    light: "bg-white text-green-900 ring-1 ring-sand-200",
  } as const;
  const kickerTone = { dark: "text-gold-500", gold: "text-green-900/75", light: "text-green-600" }[tone];
  const bodyTone = { dark: "text-ivory-50/75", gold: "text-green-900/80", light: "text-ink-600" }[tone];
  const ctaTone = {
    dark: "bg-gold-500 text-green-900",
    gold: "bg-green-900 text-ivory-50",
    light: "bg-green-900 text-ivory-50",
  }[tone];

  return (
    <m.div
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      className={`group relative flex h-full min-h-[340px] flex-col overflow-hidden rounded-[28px] p-7 transition-shadow duration-500 hover:shadow-[0_30px_80px_-30px_rgb(4_48_31/0.55)] sm:min-h-[420px] sm:p-9 ${tones[tone]}`}
    >
      <div aria-hidden className="pointer-events-none absolute -end-10 -top-10 h-44 w-44 opacity-25 transition duration-700 group-hover:rotate-45 group-hover:opacity-40">
        {ornament}
      </div>
      <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${kickerTone}`}>{kicker}</p>
      <h3 className="mt-auto pt-16 font-display text-[30px] font-semibold leading-tight sm:text-4xl">{title}</h3>
      <p className={`mt-3 text-[15px] leading-relaxed ${bodyTone}`}>{body}</p>
      <span
        className={`mt-7 inline-flex w-fit items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition group-hover:gap-3 ${ctaTone}`}
      >
        {cta}
        <span aria-hidden className="rtl:-scale-x-100">→</span>
      </span>
    </m.div>
  );
}

/** نجمة ثمانية للزينة. */
const Star = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" stroke="currentColor" strokeWidth="1.2">
    <rect x="20.7" y="20.7" width="58.6" height="58.6" />
    <rect x="20.7" y="20.7" width="58.6" height="58.6" transform="rotate(45 50 50)" />
    <circle cx="50" cy="50" r="16" />
  </svg>
);

/** ثلاث بطاقات كبيرة للمسارات. */
export function PathCards({ onAsk, reduced }: { onAsk: (p: Persona) => void; reduced: boolean }) {
  const t = useTranslations("paths");

  return (
    <section className="bg-ivory-50">
      <div className="mx-auto max-w-6xl px-4 pb-20 sm:pb-28">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-green-600">{t("kicker")}</p>
          <h2 className="mt-3 font-display text-[34px] font-semibold leading-tight sm:text-6xl">{t("title")}</h2>
        </Reveal>

        <div className="mt-12 grid gap-4 [perspective:1200px] md:grid-cols-3 md:gap-5">
          <button type="button" onClick={() => onAsk("muslim")} className="rounded-[28px] text-start">
            <TiltCard
              tone="dark"
              kicker={t("ask.kicker")}
              title={t("ask.title")}
              body={t("ask.body")}
              cta={t("ask.cta")}
              ornament={<Star className="h-full w-full text-gold-500" />}
              reduced={reduced}
            />
          </button>
          <Link href="/new-muslim" className="rounded-[28px]">
            <TiltCard
              tone="gold"
              kicker={t("newMuslim.kicker")}
              title={t("newMuslim.title")}
              body={t("newMuslim.body")}
              cta={t("newMuslim.cta")}
              ornament={<Star className="h-full w-full text-green-900" />}
              reduced={reduced}
            />
          </Link>
          <button type="button" onClick={() => onAsk("nonMuslim")} className="rounded-[28px] text-start">
            <TiltCard
              tone="light"
              kicker={t("discover.kicker")}
              title={t("discover.title")}
              body={t("discover.body")}
              cta={t("discover.cta")}
              ornament={<Star className="h-full w-full text-green-600" />}
              reduced={reduced}
            />
          </button>
        </div>
      </div>
    </section>
  );
}
