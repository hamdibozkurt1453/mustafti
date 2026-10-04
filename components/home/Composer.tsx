"use client";

import { m } from "motion/react";
import { useTranslations } from "next-intl";
import { forwardRef, type FormEvent, type KeyboardEvent } from "react";
import { SendIcon } from "../icons";
import { Typewriter } from "./Typewriter";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  variant: "hero" | "dock";
  reduced: boolean;
};

/**
 * خانة السؤال. layoutId مشترك بين الواجهة الأولى والمحادثة،
 * فتنتقل الخانة بنعومة من وسط الشاشة إلى أسفلها عند أول سؤال.
 */
export const Composer = forwardRef<HTMLTextAreaElement, Props>(function Composer(
  { value, onChange, onSubmit, variant, reduced },
  ref,
) {
  const t = useTranslations("composer");
  const hero = variant === "hero";

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (value.trim()) onSubmit();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <m.form
      layoutId="mf-composer"
      transition={{ type: "spring", stiffness: 260, damping: 32 }}
      onSubmit={submit}
      className={`relative flex w-full items-end gap-2 bg-ivory-50 text-green-900 ${
        hero
          ? "rounded-[28px] p-2.5 shadow-[0_0_0_1px_rgb(255_184_0/0.35),0_24px_80px_-20px_rgb(255_184_0/0.35)] sm:p-3"
          : "rounded-[26px] border border-sand-200 bg-white p-2 shadow-[0_10px_40px_-18px_rgb(4_48_31/0.35)]"
      }`}
    >
      <div className="relative min-w-0 flex-1">
        <label htmlFor={`q-${variant}`} className="sr-only">
          {t("label")}
        </label>
        {hero && !value && (
          <div className="absolute inset-0 flex items-start px-3 py-3 text-[17px] text-ink-600 sm:text-lg">
            <Typewriter reduced={reduced} />
          </div>
        )}
        <textarea
          id={`q-${variant}`}
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          dir="auto"
          placeholder={hero ? undefined : t("placeholder")}
          className={`field-sizing-content block w-full resize-none bg-transparent px-3 outline-none placeholder:text-ink-600 ${
            hero ? "max-h-48 min-h-[3.25rem] py-3 text-[17px] sm:text-lg" : "max-h-40 min-h-11 py-2.5 text-base"
          }`}
        />
      </div>
      <button
        type="submit"
        disabled={!value.trim()}
        aria-label={t("send")}
        className={`flex flex-none items-center justify-center rounded-full bg-gold-500 text-green-900 transition hover:brightness-105 active:scale-95 disabled:bg-sand-200 disabled:text-ink-600 ${
          hero ? "h-12 w-12" : "h-11 w-11"
        }`}
      >
        <SendIcon className="h-5 w-5 rtl:-scale-x-100" />
      </button>
    </m.form>
  );
});
