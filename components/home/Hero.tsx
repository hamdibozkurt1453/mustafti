"use client";

import { m, useScroll, useTransform } from "motion/react";
import { useTranslations } from "next-intl";
import type { RefObject } from "react";
import { Link } from "@/i18n/navigation";
import { BubbleMark } from "./BubbleMark";
import { Composer } from "./Composer";
import { GeometricPattern } from "./GeometricPattern";
import { SourcesMarquee } from "./SourcesMarquee";

export const personas = ["muslim", "newMuslim", "nonMuslim"] as const;
export type Persona = (typeof personas)[number];
const questionKeys = ["q1", "q2", "q3", "q4"] as const;
/** صفحتا «أسلمت حديثاً» و«لست مسلماً». */
const personaHref = { newMuslim: "/new-muslim", nonMuslim: "/discover" } as const;

type Props = {
  text: string;
  setText: (v: string) => void;
  onSubmit: () => void;
  /** يرسل سؤالاً مقترحاً مباشرة وينقل إلى المحادثة. */
  onAsk: (question: string) => void;
  persona: Persona | null;
  setPersona: (p: Persona | null) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  reduced: boolean;
};

/** الواجهة الأولى بملء الشاشة على الأخضر العميق. */
export function Hero({ text, setText, onSubmit, onAsk, persona, setPersona, inputRef, reduced }: Props) {
  const t = useTranslations();
  const { scrollY } = useScroll();
  // النقش يتحرك أبطأ من الصفحة (parallax)، ويخفت قليلاً
  const patternY = useTransform(scrollY, [0, 900], [0, reduced ? 0 : 260]);
  // الشفافية هنا لا في className، لأن قيمة Motion تكتب فوقها
  const patternOpacity = useTransform(scrollY, [0, 700], [0.2, 0.08]);
  const contentY = useTransform(scrollY, [0, 700], [0, reduced ? 0 : -60]);

  const lead = t("home.greetingLead").split(" ");
  const accent = t("home.greetingAccent").split(" ");
  const group = persona ?? "general";

  return (
    <section className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-green-900 text-ivory-50">
      {/* الإضاءة: تدرج أخضر من الأعلى ووهج ذهبي خافت من الأسفل */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(120% 70% at 50% -10%, rgb(10 107 69 / 0.75), transparent 60%), radial-gradient(90% 55% at 50% 115%, rgb(255 184 0 / 0.14), transparent 70%), radial-gradient(38% 26% at 50% 34%, rgb(255 184 0 / 0.09), transparent 75%)",
        }}
      />
      <m.div
        aria-hidden
        style={{ y: patternY, opacity: patternOpacity }}
        className="absolute inset-x-0 -top-10 -z-10 h-[115%] [mask-image:radial-gradient(ellipse_80%_70%_at_50%_40%,rgb(0_0_0/0.25)_0%,rgb(0_0_0/0.7)_45%,#000_70%,transparent_100%)]"
      >
        <GeometricPattern className="h-full w-full" />
      </m.div>
      <div aria-hidden className="mf-grain pointer-events-none absolute inset-0 -z-10 opacity-[0.09]" />

      <m.div
        style={{ y: contentY }}
        className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-4 pb-8 pt-20 text-center sm:pb-10 sm:pt-28"
      >
        {/* الإفصاح: ظاهر دائماً */}
        <p
          role="note"
          className="mf-rise mb-5 inline-flex max-w-full items-center gap-2 rounded-full border border-ivory-50/15 bg-ivory-50/[0.06] px-3.5 py-1.5 text-[12px] leading-snug text-ivory-50/85 backdrop-blur-sm sm:text-[13px]"
        >
          <i aria-hidden className="h-2 w-2 flex-none rounded-full bg-gold-500" />
          <span className="text-start">{t("disclosure.text")}</span>
        </p>

        <BubbleMark className="mb-4 h-14 w-14 sm:h-20 sm:w-20" />

        <h1 className="font-display text-[44px] font-semibold leading-[1.15] tracking-tight [word-spacing:0.12em] sm:text-7xl md:text-[80px]">
          {lead.map((w, i) => (
            <span key={`l${i}`} className="mf-word" style={{ animationDelay: `${0.12 + i * 0.11}s` }}>
              {w}
              {" "}
            </span>
          ))}
          <br className="sm:hidden" />
          {accent.map((w, i) => (
            <span
              key={`a${i}`}
              className="mf-word text-gold-500"
              style={{ animationDelay: `${0.12 + (lead.length + i) * 0.11}s` }}
            >
              {w}
              {i < accent.length - 1 ? " " : ""}
            </span>
          ))}
        </h1>

        <p
          className="mf-rise mt-5 max-w-2xl text-[15px] leading-relaxed text-ivory-50/80 sm:text-lg"
          style={{ animationDelay: "0.55s" }}
        >
          {t("home.intro")}
        </p>

        <div id="ask" className="mf-rise mt-8 w-full max-w-2xl scroll-mt-28" style={{ animationDelay: "0.7s" }}>
          <Composer
            ref={inputRef}
            value={text}
            onChange={setText}
            onSubmit={onSubmit}
            variant="hero"
            reduced={reduced}
          />
          <p className="mt-2 text-[12px] text-ivory-50/60">{t("composer.privacy")}</p>
        </div>

        {/* من أنت؟ (R2): «مسلم» يبقى هنا ويغيّر الاقتراحات، و«أسلمت حديثاً» و«لست مسلماً» ينقلان إلى صفحتيهما.
            R3: والسؤال المكتوب في الخانة يُحمل معهما (?q=) إلى المحادثة الموجّهة. */}
        <fieldset className="mf-rise mt-6 w-full" style={{ animationDelay: "0.85s" }}>
          <legend className="sr-only">{t("home.whoAreYou")}</legend>
          <div className="flex flex-wrap justify-center gap-2">
            {personas.map((p) => {
              const selected = persona === p;
              const base = "mf-press rounded-full border px-4 py-2 text-sm transition duration-300";
              const idle = "border-ivory-50/25 bg-ivory-50/[0.04] text-ivory-50 hover:border-gold-500/70 hover:bg-ivory-50/[0.08]";
              if (p !== "muslim") {
                return (
                  <Link
                    key={p}
                    href={text.trim() ? { pathname: personaHref[p], query: { q: text.trim().slice(0, 2000) } } : personaHref[p]}
                    className={`${base} ${idle}`}
                  >
                    {t(`home.personas.${p}`)}
                  </Link>
                );
              }
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setPersona(selected ? null : p)}
                  className={`${base} ${selected ? "border-gold-500 bg-gold-500 font-semibold text-green-900" : idle}`}
                >
                  {t(`home.personas.${p}`)}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* أسئلة مقترحة: صف أفقي ينزلق */}
        <div className="mf-rise mt-6 w-full" style={{ animationDelay: "1s" }}>
          <h2 className="sr-only">{t("home.suggestionsTitle")}</h2>
          <ul className="mf-no-scrollbar -mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [mask-image:linear-gradient(to_right,transparent,#000_16px,#000_calc(100%-16px),transparent)] sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0 sm:[mask-image:none]">
            {questionKeys.map((q) => {
              const question = t(`home.suggestions.${group}.${q}`);
              return (
                <li key={`${group}-${q}`} className="snap-start">
                  <button
                    type="button"
                    onClick={() => onAsk(question)}
                    className="mf-press whitespace-nowrap rounded-full border border-ivory-50/10 bg-green-600/30 px-3.5 py-1.5 text-[13px] text-ivory-50/90 transition hover:border-gold-500/60 hover:text-ivory-50"
                  >
                    {question}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </m.div>

      <SourcesMarquee />
    </section>
  );
}
