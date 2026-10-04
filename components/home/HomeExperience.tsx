"use client";

import { AnimatePresence, LazyMotion, m, MotionConfig, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { setChatMode } from "@/lib/ui-store";
import { ChatView, type Message } from "./ChatView";
import { Hero, type Persona } from "./Hero";
import { HowItWorks } from "./HowItWorks";
import { PathCards } from "./PathCards";
import { PrayerCard } from "./PrayerCard";
import { Stats } from "./Stats";

const loadFeatures = () => import("@/lib/motion-features").then((mod) => mod.default);

/**
 * الصفحة الرئيسية: الواجهة الأولى والأقسام، ثم تتحول إلى محادثة عند أول سؤال.
 * غير مربوطة بالنموذج بعد (S5): الرد مؤقت يقول إن المحادثة قيد التفعيل.
 */
export function HomeExperience() {
  const t = useTranslations();
  const reduced = useReducedMotion() ?? false;
  const [persona, setPersona] = useState<Persona | null>(null);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const idRef = useRef(0);
  const chatting = messages.length > 0;

  useEffect(() => {
    setChatMode(chatting);
  }, [chatting]);
  useEffect(() => () => setChatMode(false), []);

  function send() {
    const q = text.trim();
    if (!q) return;
    const userId = ++idRef.current;
    const botId = ++idRef.current;
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", text: q },
      { id: botId, role: "bot", text: "", pending: true },
    ]);
    setText("");
    if (!chatting) window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    // يُستبدل بالجواب الحقيقي في S5.
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === botId ? { ...m, pending: false, text: t("composer.notice") } : m)),
      );
    }, 1100);
  }

  function reset() {
    setMessages([]);
    setText("");
  }

  function askAs(p: Persona) {
    setPersona(p);
    document.getElementById("ask")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    setTimeout(() => inputRef.current?.focus({ preventScroll: true }), reduced ? 0 : 600);
  }

  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">
        <AnimatePresence mode="popLayout" initial={false}>
          {!chatting ? (
            <m.div
              key="landing"
              exit={{ opacity: 0, scale: 0.94, filter: "blur(6px)" }}
              transition={{ duration: 0.5, ease: [0.65, 0, 0.35, 1] }}
              className="origin-top"
            >
              <Hero
                text={text}
                setText={setText}
                onSubmit={send}
                persona={persona}
                setPersona={setPersona}
                inputRef={inputRef}
                reduced={reduced}
              />
              <Stats reduced={reduced} />
              <HowItWorks reduced={reduced} />
              <PathCards onAsk={askAs} reduced={reduced} />
              <PrayerCard />
            </m.div>
          ) : (
            <m.div
              key="chat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              <ChatView
                messages={messages}
                text={text}
                setText={setText}
                onSubmit={send}
                onReset={reset}
                inputRef={inputRef}
                reduced={reduced}
              />
            </m.div>
          )}
        </AnimatePresence>
      </MotionConfig>
    </LazyMotion>
  );
}
