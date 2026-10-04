"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { dirForText, type ChatSource } from "@/lib/chat/protocol";

const LONG = 320;

/** بطاقة مصدر: شارة «نص منقول»، والنص بحروفه، واسم المصدر، والدرجة للحديث، ورابط «عرض المصدر». */
export function SourceCard({ source, messageId }: { source: ChatSource; messageId: string }) {
  const t = useTranslations("chat");
  const [open, setOpen] = useState(false);
  const long = source.text.length > LONG;
  const dir = dirForText(source.text);

  return (
    <li
      id={`src-${messageId}-${source.n}`}
      className="scroll-mt-28 rounded-[20px] border border-sand-200 bg-white p-4 target:ring-2 target:ring-gold-500"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-green-900 px-1.5 text-xs font-semibold text-ivory-50">
          {source.n}
        </span>
        <span className="rounded-full bg-gold-50 px-2.5 py-0.5 text-[11px] font-semibold text-green-900 ring-1 ring-gold-500/50">
          {t("badgeQuoted")}
        </span>
        {source.grade && (
          <span className="rounded-full bg-green-600/10 px-2.5 py-0.5 text-[11px] font-semibold text-green-600">
            {t("grade")}: <span dir="auto">{source.grade}</span>
          </span>
        )}
      </div>
      <p dir="auto" className="mt-2 text-sm font-semibold leading-snug">
        {source.title}
      </p>
      {source.verse ? (
        <>
          {/* الآية بنصها كما في المصحف، ثم التفسير الميسر أو ترجمة المعنى بعنوانهما. */}
          <blockquote
            dir="rtl"
            lang="ar"
            className="mt-2 rounded-2xl bg-ivory-50 px-4 py-3 text-center text-[19px] leading-[2.1] text-green-900"
          >
            ﴿{source.verse}﴾
          </blockquote>
          {source.note && (
            <div className="mt-2">
              <p className="text-[11px] font-semibold text-green-600">
                {source.noteKind === "translation" ? t("noteTranslation") : t("noteTafsir")}
              </p>
              <p
                dir={dirForText(source.note)}
                className={`mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-green-900/90 ${
                  source.note.length > LONG && !open ? "line-clamp-5" : ""
                }`}
              >
                {source.note}
              </p>
            </div>
          )}
        </>
      ) : (
        <blockquote
          dir={dir}
          className={`mt-2 whitespace-pre-wrap border-s-2 border-gold-500 ps-3 text-[14px] leading-relaxed text-green-900/90 ${
            long && !open ? "line-clamp-5" : ""
          }`}
        >
          {source.text}
        </blockquote>
      )}
      {(source.verse ? (source.note?.length ?? 0) > LONG : long) && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1 text-xs font-semibold text-green-600 underline-offset-4 hover:underline"
        >
          {open ? t("showLess") : t("showMore")}
        </button>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-sand-200 pt-3 text-xs">
        <span dir="auto" className="text-ink-600">
          {source.source}
        </span>
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-full bg-green-900 px-3 py-1.5 font-semibold text-ivory-50 transition hover:bg-green-600"
        >
          {t("viewSource")}
          <span aria-hidden>↗</span>
        </a>
      </div>
    </li>
  );
}
