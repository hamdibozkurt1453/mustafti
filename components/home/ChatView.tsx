"use client";

import { AnimatePresence, m } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, type RefObject } from "react";
import { BubbleMark } from "./BubbleMark";
import { Composer } from "./Composer";

export type Message = { id: number; role: "user" | "bot"; text: string; pending?: boolean };

type Props = {
  messages: Message[];
  text: string;
  setText: (v: string) => void;
  onSubmit: () => void;
  onReset: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  reduced: boolean;
};

/** واجهة المحادثة: الرسائل في الوسط، والخانة مثبتة في الأسفل. */
export function ChatView({ messages, text, setText, onSubmit, onReset, inputRef, reduced }: Props) {
  const t = useTranslations();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "end" });
  }, [messages, reduced]);

  return (
    <div className="flex min-h-[100svh] flex-col bg-ivory-50">
      <section aria-label={t("chat.label")} className="mx-auto w-full max-w-3xl flex-1 px-4 pb-44 pt-24">
        <div className="mb-6 flex justify-center">
          <button
            type="button"
            onClick={onReset}
            className="rounded-full border border-sand-200 bg-white px-4 py-1.5 text-xs font-semibold text-green-600 transition hover:border-green-600"
          >
            + {t("chat.newChat")}
          </button>
        </div>
        <ol className="flex flex-col gap-5" aria-live="polite">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <m.li
                key={msg.id}
                initial={reduced ? false : { opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className={`flex gap-3 ${msg.role === "user" ? "justify-start" : "flex-row-reverse justify-start"}`}
              >
                {msg.role === "bot" && <BubbleMark className="mt-1 h-8 w-8 flex-none" />}
                <div
                  dir="auto"
                  className={`max-w-[85%] whitespace-pre-wrap rounded-[22px] px-4 py-3 text-[15px] leading-relaxed sm:text-base ${
                    msg.role === "user"
                      ? "rounded-ss-md bg-green-900 text-ivory-50"
                      : "rounded-se-md border border-sand-200 bg-white text-green-900"
                  }`}
                >
                  <span className="sr-only">{msg.role === "user" ? t("chat.you") : t("chat.bot")}: </span>
                  {msg.pending ? (
                    <span className="flex items-center gap-1.5 py-1" aria-label={t("chat.thinking")}>
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="mf-dot h-2 w-2 rounded-full bg-green-600"
                          style={{ animationDelay: `${i * 0.15}s`, animationDuration: "1.2s", ["--mf-dot-lift" as string]: "-5px" }}
                        />
                      ))}
                    </span>
                  ) : (
                    msg.text
                  )}
                </div>
              </m.li>
            ))}
          </AnimatePresence>
        </ol>
        <div ref={endRef} />
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-ivory-50 via-ivory-50/95 to-transparent pt-8">
        <div className="mx-auto w-full max-w-3xl px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Composer ref={inputRef} value={text} onChange={setText} onSubmit={onSubmit} variant="dock" reduced={reduced} />
          <p className="mt-2 text-center text-[11px] text-ink-600">{t("disclosure.text")}</p>
        </div>
      </div>
    </div>
  );
}
