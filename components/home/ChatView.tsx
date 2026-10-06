"use client";

import { AnimatePresence, m } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { GlossaryTerm } from "@/lib/brain/glossary";
import { BotReply } from "../chat/BotReply";
import { GuestNotice } from "../chat/GuestNotice";
import type { CaseApi } from "../chat/CaseFlow";
import { TermDialog } from "../chat/TermDialog";
import type { ChatMessage } from "../chat/useChat";
import { BubbleMark } from "./BubbleMark";
import { Composer } from "./Composer";

type Props = {
  messages: ChatMessage[];
  text: string;
  setText: (v: string) => void;
  onSubmit: () => void;
  onReset: () => void;
  onRetry: (id: string) => void;
  /** سؤال مقترح عند الامتناع. */
  onAsk: (question: string) => void;
  caseApi: CaseApi;
  busy: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  reduced: boolean;
  /** R3: اسم المحادثة الموجّهة فوق «محادثة جديدة» («رفيق المسلم الجديد»، «تعرّف على الإسلام»). */
  title?: string;
};

/**
 * واجهة المحادثة: السائل في فقاعة خضراء داكنة، ومُستفتي في فقاعة بيضاء مع بطاقات المصادر،
 * والخانة مثبتة في الأسفل. اتجاه كل فقاعة حسب لغة نصها (RTL للعربية والأردية والفارسية).
 */
export function ChatView({ messages, text, setText, onSubmit, onReset, onRetry, onAsk, caseApi, busy, inputRef, reduced, title }: Props) {
  const t = useTranslations();
  const endRef = useRef<HTMLDivElement>(null);
  const [term, setTerm] = useState<GlossaryTerm | null>(null);
  const last = messages[messages.length - 1];

  // التمرير مع الجواب: عند كل رسالة جديدة، ومع البث ما دام السائل قريباً من الأسفل.
  useEffect(() => {
    // بطاقة ملف المسألة تمرّر نفسها إلى أولها (CaseFlow.tsx)، فلا ننزل إلى زر الإرسال.
    if (last?.role === "bot" && last.kind === "caseFile" && last.status === "done") return;
    const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 320;
    if (nearBottom || last?.role === "user" || (last?.role === "bot" && last.status === "pending")) {
      endRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "end" });
    }
  }, [messages.length, last, reduced]);

  return (
    <div className="flex min-h-[100svh] flex-col bg-ivory-50">
      <section aria-label={t("chat.label")} className="mx-auto w-full max-w-3xl flex-1 px-4 pb-48 pt-24">
        {/* F1: الزائر غير المسجّل يعرف أن محادثته لا تُحفظ، وبإمكانه الدخول أو إغلاق الشريط. */}
        <GuestNotice />
        <div className="mb-6 flex flex-col items-center gap-2">
          {title && <p className="text-sm font-semibold text-green-900">{title}</p>}
          <button
            type="button"
            onClick={onReset}
            className="rounded-full border border-sand-200 bg-white px-4 py-1.5 text-xs font-semibold text-green-600 transition hover:border-green-600"
          >
            + {t("chat.newChat")}
          </button>
        </div>
        <ol className="flex flex-col gap-5">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <m.li
                key={msg.id}
                initial={reduced ? false : { opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className={`flex gap-3 ${msg.role === "user" ? "justify-start" : "flex-row-reverse justify-start"}`}
              >
                <span className="sr-only">{msg.role === "user" ? t("chat.you") : t("chat.bot")}: </span>
                {msg.role === "user" ? (
                  <div
                    dir={msg.skipped ? undefined : msg.dir}
                    className={`max-w-[85%] whitespace-pre-wrap rounded-[22px] rounded-ss-md px-4 py-3 text-[15px] leading-relaxed sm:text-base ${
                      msg.skipped ? "bg-green-900/70 italic text-ivory-50/90" : "bg-green-900 text-ivory-50"
                    }`}
                  >
                    {msg.skipped ? t("case.skipped") : msg.text}
                  </div>
                ) : (
                  <>
                    <BubbleMark className="mt-1 h-8 w-8 flex-none" />
                    <div className="min-w-0 max-w-[calc(100%-2.75rem)] flex-1 sm:max-w-[88%] sm:flex-none" aria-live="polite">
                      <BotReply msg={msg} onTerm={setTerm} onRetry={onRetry} onAsk={onAsk} caseApi={caseApi} />
                    </div>
                  </>
                )}
              </m.li>
            ))}
          </AnimatePresence>
        </ol>
        <div ref={endRef} />
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-ivory-50 via-ivory-50/95 to-transparent pt-8">
        <div className="mx-auto w-full max-w-3xl px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Composer ref={inputRef} value={text} onChange={setText} onSubmit={onSubmit} variant="dock" reduced={reduced} disabled={busy} />
          <p className="mt-2 text-center text-[11px] text-ink-600">{t("disclosure.text")}</p>
        </div>
      </div>

      <TermDialog term={term} onClose={() => setTerm(null)} />
    </div>
  );
}
