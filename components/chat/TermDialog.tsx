"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { equivalentFor, type GlossaryTerm } from "@/lib/brain/glossary";
import { CloseIcon } from "../icons";

/**
 * نافذة المصطلح: المصطلح العربي، ومقابله المعتمد بلغة الواجهة (أو الإنجليزية)، وضابط استخدامه
 * حرفياً من قاموس المرجعية. على الهاتف تظهر من أسفل الشاشة.
 */
export function TermDialog({ term, onClose }: { term: GlossaryTerm | null; onClose: () => void }) {
  const t = useTranslations("chat.term");
  const locale = useLocale();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (term && !dialog.open) dialog.showModal();
    if (!term && dialog.open) dialog.close();
  }, [term]);

  const equivalent = term ? (equivalentFor(term, locale) ?? (locale === "ar" ? null : term.en)) : null;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // الضغط خارج البطاقة
      }}
      aria-labelledby="mf-term-title"
      className="m-0 mt-auto w-full max-w-none rounded-t-[28px] bg-ivory-50 p-0 text-green-900 backdrop:bg-green-900/50 backdrop:backdrop-blur-sm sm:m-auto sm:max-w-md sm:rounded-[28px]"
    >
      {term && (
        <div className="p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="flex items-start justify-between gap-4">
            <h2 id="mf-term-title" dir="rtl" className="font-display text-3xl font-semibold">
              {term.term_ar}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("close")}
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white text-green-900 ring-1 ring-sand-200 transition hover:ring-green-600"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
          {equivalent && equivalent !== term.term_ar && (
            <p className="mt-2 text-sm">
              <span className="text-ink-600">{t("equivalent")}: </span>
              <span dir="auto" className="font-semibold">
                {equivalent}
              </span>
            </p>
          )}
          <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-sand-200">
            <p className="text-xs font-semibold text-green-600">{t("usage")}</p>
            <p dir="rtl" className="mt-1 text-[15px] leading-relaxed">
              {term.usage_ar}
            </p>
          </div>
          <p className="mt-3 text-xs text-ink-600">{t("source")}</p>
        </div>
      )}
    </dialog>
  );
}
