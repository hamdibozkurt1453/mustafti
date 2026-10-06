"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { GLOSSARY, type GlossaryTerm } from "@/lib/brain/glossary";
import { splitQuranSpans } from "@/lib/quran-text";

/**
 * نص جواب مُستفتي: إشارات المصادر [n] تصير روابط إلى بطاقاتها، ومصطلحات القاموس
 * (data/glossary.json) تصير أزراراً تفتح نافذة المصطلح. أول ورود لكل مصطلح فقط، حتى لا يزدحم النص.
 */

const REF = /[\[(（]\s*(\d{1,2})\s*[\])）]/g;

/** نمط الاسم كما يُكتب في النص (بلا توحيد للحروف)، مع سوابق العربية المتصلة. */
function aliasSource(alias: string): string {
  const latin = !/[؀-ۿ]/.test(alias);
  const word = alias.replace(/^ال/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // التشكيل اختياري بين الحروف العربية.
  const body = latin ? word : [...word].map((ch) => `${ch}[\\u064B-\\u0652\\u0670]*`).join("");
  return latin ? body : `(?:[وفبلك])?(?:ال)?${body}`;
}

type Matcher = { term: GlossaryTerm; re: RegExp };

const MATCHERS: Matcher[] = GLOSSARY.map((term) => ({
  term,
  re: new RegExp(
    `(?<![\\p{L}\\p{M}])(?:${[...new Set(term.aliases)].sort((a, b) => b.length - a.length).map(aliasSource).join("|")})(?![\\p{L}\\p{M}])`,
    "iu",
  ),
}));

/** أول ورود لكل مصطلح في النص: [بداية، نهاية، المصطلح]، مرتبة وبلا تداخل. */
function findSpans(text: string): { start: number; end: number; term: GlossaryTerm }[] {
  const spans: { start: number; end: number; term: GlossaryTerm }[] = [];
  for (const { term, re } of MATCHERS) {
    const m = re.exec(text);
    if (m) spans.push({ start: m.index, end: m.index + m[0].length, term });
  }
  spans.sort((a, b) => a.start - b.start);
  return spans.filter((s, i) => i === 0 || s.start >= spans[i - 1].end);
}

type Props = {
  text: string;
  /** رقم الرسالة (لروابط البطاقات). */
  messageId: string;
  /** أرقام البطاقات المعروضة (لا رابط لرقم بلا بطاقة). */
  cards: number[];
  onTerm: (term: GlossaryTerm) => void;
};

/** «**عنوان**» وسطر «## عنوان» (R5: الجواب الحر قد يُنظَّم بعناوين قصيرة): أجزاء عادية وعريضة. */
function boldParts(text: string): { text: string; bold: boolean }[] {
  const src = text.replace(/^[ \t]*#{1,4}[ \t]+(.+?)[ \t]*$/gm, "**$1**");
  const parts: { text: string; bold: boolean }[] = [];
  let last = 0;
  for (const m of src.matchAll(/\*\*([^*\n]+)\*\*/g)) {
    if (m.index! > last) parts.push({ text: src.slice(last, m.index), bold: false });
    parts.push({ text: m[1], bold: true });
    last = m.index! + m[0].length;
  }
  if (last < src.length) parts.push({ text: src.slice(last), bold: false });
  return parts;
}

export function RichText({ text, messageId, cards, onTerm }: Props) {
  const t = useTranslations("chat");
  const used = new Set<string>();
  let key = 0;

  const renderPlain = (segment: string): ReactNode[] => {
    const out: ReactNode[] = [];
    const pushTerms = (part: string) => {
      let rest = part;
      while (rest) {
        const span = findSpans(rest).find((s) => !used.has(s.term.id));
        if (!span) {
          out.push(rest);
          break;
        }
        used.add(span.term.id);
        if (span.start) out.push(rest.slice(0, span.start));
        const word = rest.slice(span.start, span.end);
        out.push(
          <button
            key={`t${key++}`}
            type="button"
            onClick={() => onTerm(span.term)}
            title={t("term.hint")}
            className="cursor-help rounded-sm font-semibold text-green-600 underline decoration-gold-500 decoration-dotted decoration-2 underline-offset-4 transition hover:bg-gold-50"
          >
            {word}
          </button>,
        );
        rest = rest.slice(span.end);
      }
    };

    let last = 0;
    for (const m of segment.matchAll(REF)) {
      pushTerms(segment.slice(last, m.index));
      const n = Number(m[1]);
      out.push(
        cards.includes(n) ? (
          <a
            key={`r${key++}`}
            href={`#src-${messageId}-${n}`}
            aria-label={t("sourceRef", { n })}
            className="mx-0.5 inline-flex h-5 min-w-5 -translate-y-0.5 items-center justify-center rounded-full bg-green-900/10 px-1.5 align-middle text-[11px] font-semibold text-green-900 no-underline transition hover:bg-gold-500"
          >
            {n}
          </a>
        ) : (
          <span key={`r${key++}`}>{m[0]}</span>
        ),
      );
      last = (m.index ?? 0) + m[0].length;
    }
    pushTerms(segment.slice(last));
    return out;
  };

  // F1: الآية بين ﴿ ﴾ بخط المصحف (quran-text) بعد تنظيف الرموز التي لا يدعمها الهاتف.
  const render = (segment: string): ReactNode[] =>
    splitQuranSpans(segment).flatMap((part): ReactNode[] =>
      part.quran
        ? [
            <span key={`q${key++}`} lang="ar" dir="rtl" className="quran-text">
              {part.text}
            </span>,
          ]
        : renderPlain(part.text),
    );

  return (
    <>
      {boldParts(text).map((p) =>
        p.bold ? (
          <strong key={`b${key++}`} className="font-semibold text-green-900">
            {render(p.text)}
          </strong>
        ) : (
          render(p.text)
        ),
      )}
    </>
  );
}
