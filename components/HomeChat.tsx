"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link } from "@/i18n/navigation";
import { ClockIcon, SendIcon } from "./icons";

const personas = ["muslim", "newMuslim", "nonMuslim"] as const;
type Persona = (typeof personas)[number];
const questionKeys = ["q1", "q2", "q3", "q4"] as const;

/**
 * الصفحة الرئيسية قبل السؤال (القسم 1.3): الترحيب، و«من أنت؟»، والاقتراحات،
 * وبطاقة الصلاة القادمة، وخانة الكتابة. غير مربوطة بالنموذج بعد (S5).
 */
export function HomeChat() {
  const t = useTranslations();
  const [persona, setPersona] = useState<Persona | null>(null);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const group = persona ?? "general";

  function pick(question: string) {
    setText(question);
    setNotice(false);
    inputRef.current?.focus();
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!text.trim()) return;
    // يُربط بالمحادثة في S5.
    setNotice(true);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center px-4 pb-8 pt-10 text-center sm:pt-14">
        <Image
          src="/brand/icon-app.svg"
          alt=""
          width={72}
          height={72}
          priority
          className="h-16 w-16 rounded-2xl sm:h-[72px] sm:w-[72px]"
        />
        <h1 className="mt-5 text-[28px] font-bold leading-snug sm:text-[40px]">
          {t("home.greeting")}
        </h1>
        <p className="mt-3 max-w-xl text-[15px] text-ink-600 sm:text-[17px]">{t("home.intro")}</p>

        {/* من أنت؟ — اختياري، يغيّر الاقتراحات فقط */}
        <fieldset className="mt-8 w-full">
          <legend className="mx-auto text-sm font-semibold">
            {t("home.whoAreYou")}{" "}
            <span className="font-normal text-ink-600">· {t("home.whoOptional")}</span>
          </legend>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {personas.map((p) => {
              const selected = persona === p;
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setPersona(selected ? null : p)}
                  className={`rounded-full border-[1.5px] px-4 py-1.5 text-sm transition ${
                    selected
                      ? "border-green-900 bg-green-900 text-ivory-50"
                      : "border-green-600 text-green-600 hover:bg-white"
                  }`}
                >
                  {t(`home.personas.${p}`)}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* أسئلة مقترحة */}
        <div className="mt-8 w-full">
          <h2 className="sr-only">{t("home.suggestionsTitle")}</h2>
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {questionKeys.map((q) => {
              const question = t(`home.suggestions.${group}.${q}`);
              return (
                <li key={`${group}-${q}`}>
                  <button
                    type="button"
                    onClick={() => pick(question)}
                    className="h-full w-full rounded-2xl border border-sand-200 bg-white px-4 py-3 text-start text-[15px] transition hover:border-green-600"
                  >
                    {question}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* بطاقة الصلاة القادمة — تُملأ بالمواقيت في S6 */}
        <Link
          href="/prayer"
          className="mt-6 flex w-full items-center gap-3 rounded-2xl bg-green-900 px-4 py-3 text-start text-ivory-50 transition hover:brightness-110"
        >
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-gold-500 text-green-900">
            <ClockIcon className="h-5 w-5" />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-semibold">{t("home.nextPrayer.title")}</span>
            <span className="block text-xs text-ivory-50/75">{t("home.nextPrayer.hint")}</span>
          </span>
          <span className="text-xs font-semibold text-gold-500">{t("home.nextPrayer.link")}</span>
        </Link>
      </section>

      {/* خانة الكتابة: ثابتة أسفل الشاشة */}
      <div className="sticky bottom-0 z-30 border-t border-sand-200 bg-ivory-50/95 backdrop-blur">
        <form onSubmit={submit} className="mx-auto w-full max-w-2xl px-4 pb-3 pt-3">
          {notice && (
            <p role="status" className="mb-2 rounded-xl bg-green-900 px-3 py-2 text-sm text-ivory-50">
              {t("composer.notice")}
            </p>
          )}
          <div className="flex items-end gap-2 rounded-3xl border border-sand-200 bg-white p-2 focus-within:border-green-600">
            <label htmlFor="question" className="sr-only">
              {t("composer.label")}
            </label>
            <textarea
              id="question"
              ref={inputRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setNotice(false);
              }}
              onKeyDown={onKeyDown}
              rows={1}
              dir="auto"
              placeholder={t("composer.placeholder")}
              className="field-sizing-content max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-base outline-none placeholder:text-ink-600/70"
            />
            <button
              type="submit"
              disabled={!text.trim()}
              aria-label={t("composer.send")}
              className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-gold-500 text-green-900 transition hover:brightness-105 disabled:bg-sand-200 disabled:text-ink-600"
            >
              <SendIcon className="h-5 w-5 rtl:-scale-x-100" />
            </button>
          </div>
          <p className="mt-1.5 text-center text-xs text-ink-600">{t("composer.privacy")}</p>
        </form>
      </div>
    </div>
  );
}
