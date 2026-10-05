"use client";

import { AnimatePresence, LazyMotion, m, MotionConfig, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { setChatMode } from "@/lib/ui-store";
import { useChat } from "../chat/useChat";
import { ChatView } from "./ChatView";
import { Hero, type Persona } from "./Hero";
import { HowItWorks } from "./HowItWorks";
import { PathCards } from "./PathCards";
import { FEATURE_EXTRAS } from "@/lib/config";
import { personas } from "./Hero";
import { PrayerCard } from "./PrayerCard";
import { Stats } from "./Stats";

const loadFeatures = () => import("@/lib/motion-features").then((mod) => mod.default);

/**
 * الصفحة الرئيسية: الواجهة الأولى والأقسام، ثم تتحول إلى محادثة حية عند أول سؤال
 * (من الخانة الأولى أو من سؤال مقترح). المحادثة محفوظة في المتصفح، فتعود عند فتح الصفحة.
 */
export function HomeExperience() {
  const reduced = useReducedMotion() ?? false;
  const [persona, setPersona] = useState<Persona | null>(null);
  const [text, setText] = useState("");
  const { messages, send, retry, reset, busy, caseApi } = useChat();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatting = messages.length > 0;

  useEffect(() => {
    setChatMode(chatting);
  }, [chatting]);
  useEffect(() => () => setChatMode(false), []);

  // ‎/?as=newMuslim (من صفحة /new-muslim): يفتح خانة السؤال بمسار الشخصية المطلوبة.
  useEffect(() => {
    const as = new URLSearchParams(window.location.search).get("as");
    if (!as || !(personas as readonly string[]).includes(as)) return;
    const id = setTimeout(() => askAs(as as Persona), 300);
    return () => clearTimeout(id);
    // مرة واحدة عند فتح الصفحة.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    send(q);
    setText("");
    if (!chatting) window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }

  function newChat() {
    reset();
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
                onSubmit={() => ask(text)}
                onAsk={ask}
                persona={persona}
                setPersona={setPersona}
                inputRef={inputRef}
                reduced={reduced}
              />
              <Stats reduced={reduced} />
              <HowItWorks reduced={reduced} />
              <PathCards onAsk={askAs} reduced={reduced} />
              {FEATURE_EXTRAS && <PrayerCard />}
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
                onSubmit={() => ask(text)}
                onReset={newChat}
                onRetry={retry}
                caseApi={caseApi}
                busy={busy}
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
