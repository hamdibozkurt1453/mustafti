"use client";

import { AnimatePresence, LazyMotion, m, MotionConfig, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ChatMode } from "@/lib/brain/modes";
import { setChatMode } from "@/lib/ui-store";
import { ChatView } from "../home/ChatView";
import { Composer } from "../home/Composer";
import { ConversationSidebar } from "./ConversationSidebar";
import { useChat } from "./useChat";
import { useConversations } from "./useConversations";

const loadFeatures = () => import("@/lib/motion-features").then((mod) => mod.default);

type GuidedMode = Exclude<ChatMode, "general">;

/** مفاتيح الترجمة لكل وضع (guided.newMuslim و guided.discover). */
const NAMESPACE = { new_muslim: "guided.newMuslim", discover: "guided.discover" } as const;
const QUESTIONS = ["q1", "q2", "q3"] as const;

/**
 * المحادثة الموجّهة (R3): «المرشد» في /new-muslim و«الداعية» في /discover.
 * واجهة المحادثة نفسها في الرئيسية (useChat، وComposer، وChatView، وBotReply، وCaseFlow)، مع
 * وضع يمرّ إلى الخادم (mode) ومسار للمسألة عند الإحالة (track). قبل أول سؤال: العنوان وسطر
 * التعريف وثلاثة أسئلة مقترحة، والسؤال المكتوب في الرئيسية يصل عبر ?q= إلى الخانة جاهزاً.
 */
export function GuidedChat({ mode, children }: { mode: GuidedMode; children?: ReactNode }) {
  const t = useTranslations(NAMESPACE[mode]);
  const tc = useTranslations("composer");
  const reduced = useReducedMotion() ?? false;
  const [text, setText] = useState("");
  const chat = useChat(mode);
  const { messages, send, retry, reset, busy, caseApi } = chat;
  // F2: سجل المحادثات للمسجّل، لكل وضع سجله.
  const history = useConversations(mode, chat);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatting = messages.length > 0;

  useEffect(() => {
    setChatMode(chatting);
  }, [chatting]);
  useEffect(() => () => setChatMode(false), []);

  // ‎?q= من أزرار «من أنت؟» في الرئيسية: السؤال المكتوب يصل إلى الخانة، ويرسله السائل بنفسه.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q")?.trim().slice(0, 2000);
    if (!q) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(q);
    const id = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 300);
    return () => clearTimeout(id);
  }, []);

  function newChat() {
    if (history.signedIn) history.startNew();
    else reset();
    setText("");
  }

  function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    send(q);
    setText("");
    if (!chatting) window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }

  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">
        {/* F2: زر «محادثاتي» قبل أول سؤال (خارج الحركة: العنصر الثابت لا يتبع عنصراً متحركاً). */}
        {!chatting && <ConversationSidebar api={history} onNew={newChat} docked={false} />}
        <AnimatePresence mode="popLayout" initial={false}>
          {!chatting ? (
            <m.div key="landing" exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.35 }} className="origin-top">
              <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
                <section className="mf-stagger relative isolate overflow-hidden rounded-[28px] bg-green-900 p-6 text-ivory-50 sm:p-10">
                  <div
                    aria-hidden
                    className="absolute inset-0 -z-10"
                    style={{
                      background:
                        "radial-gradient(70% 80% at 85% 0%, rgb(10 107 69 / 0.8), transparent 70%), radial-gradient(60% 60% at 15% 110%, rgb(255 184 0 / 0.14), transparent 70%)",
                    }}
                  />
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-500">{t("kicker")}</p>
                  <h1 className="mt-3 font-display text-[30px] font-bold leading-snug sm:text-[42px]">{t("title")}</h1>
                  <p className="mt-3 text-ivory-50/85 sm:text-[17px]">{t("lead")}</p>
                  <div className="mt-7">
                    <Composer
                      ref={inputRef}
                      value={text}
                      onChange={setText}
                      onSubmit={() => ask(text)}
                      variant="hero"
                      reduced={reduced}
                      typewriter={false}
                    />
                    <p className="mt-2 text-[12px] text-ivory-50/60">{tc("privacy")}</p>
                  </div>
                  <ul className="mt-5 flex flex-wrap gap-2">
                    {QUESTIONS.map((k) => {
                      const question = t(k);
                      return (
                        <li key={k}>
                          <button
                            type="button"
                            onClick={() => ask(question)}
                            className="mf-press rounded-full border border-ivory-50/15 bg-green-600/30 px-3.5 py-1.5 text-start text-[13px] text-ivory-50/90 transition hover:border-gold-500/60 hover:text-ivory-50"
                          >
                            {question}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
                {children}
              </main>
            </m.div>
          ) : (
            <m.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.1 }}>
              <ChatView
                messages={messages}
                text={text}
                setText={setText}
                onSubmit={() => ask(text)}
                onReset={newChat}
                onRetry={retry}
                onAsk={ask}
                caseApi={caseApi}
                busy={busy}
                inputRef={inputRef}
                reduced={reduced}
                title={t("title")}
                history={history}
              />
            </m.div>
          )}
        </AnimatePresence>
      </MotionConfig>
    </LazyMotion>
  );
}
