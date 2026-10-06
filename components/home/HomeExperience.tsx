"use client";

import { AnimatePresence, LazyMotion, m, MotionConfig, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { consumeHomeRequest, setChatMode, useHomeRequests } from "@/lib/ui-store";
import { useChat } from "../chat/useChat";
import { useConversations } from "../chat/useConversations";
import { ChatView } from "./ChatView";
import { Hero, type Persona } from "./Hero";
import { HowItWorks } from "./HowItWorks";
import type { Dhikr } from "@/lib/adhkar/group";
import { FEATURE_EXTRAS } from "@/lib/config";
import { personas } from "./Hero";
import { PrayerCard } from "./PrayerCard";
import { Reveal } from "./Reveal";
import { Stats } from "./Stats";

const loadFeatures = () => import("@/lib/motion-features").then((mod) => mod.default);

/**
 * الصفحة الرئيسية: الواجهة الأولى والأقسام، ثم تتحول إلى محادثة حية عند أول سؤال
 * (من الخانة الأولى أو من سؤال مقترح). المحادثة محفوظة في المتصفح، فتعود عند فتح الصفحة.
 * R2: تحت المحادثة مباشرة بطاقة المواقيت (F2b: والأذكار الموقوتة داخلها)، ثم «بالأرقام» و«كيف يعمل».
 */
export function HomeExperience({ adhkar }: { adhkar: Dhikr[] }) {
  const reduced = useReducedMotion() ?? false;
  const [persona, setPersona] = useState<Persona | null>(null);
  const [text, setText] = useState("");
  const chat = useChat();
  const { messages, send, retry, reset, busy, loaded, caseApi } = chat;
  // F2: سجل المحادثات للمسجّل (الحفظ الآلي والشريط الجانبي)؛ الزائر على التخزين المحلي كما كان.
  const history = useConversations("general", chat);
  const homeRequests = useHomeRequests();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatting = messages.length > 0;

  useEffect(() => {
    setChatMode(chatting);
  }, [chatting]);
  useEffect(() => () => setChatMode(false), []);

  function askAs(p: Persona) {
    setPersona(p);
    document.getElementById("ask")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    setTimeout(() => inputRef.current?.focus({ preventScroll: true }), reduced ? 0 : 600);
  }

  // ‎/?as=newMuslim (من صفحة /new-muslim): يفتح خانة السؤال بمسار الشخصية المطلوبة.
  useEffect(() => {
    const as = new URLSearchParams(window.location.search).get("as");
    if (!as || !(personas as readonly string[]).includes(as)) return;
    const id = setTimeout(() => askAs(as as Persona), 300);
    return () => clearTimeout(id);
    // مرة واحدة عند فتح الصفحة.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ‎/?q= (من زر «اسأل مُستفتي عن هذا» في الحوار، R4): السؤال يصل إلى الخانة، ويرسله السائل بنفسه.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q")?.trim().slice(0, 2000);
    if (!q) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(q);
    const id = setTimeout(() => {
      document.getElementById("ask")?.scrollIntoView({ behavior: "auto", block: "center" });
      inputRef.current?.focus({ preventScroll: true });
    }, 300);
    return () => clearTimeout(id);
  }, []);

  function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    send(q);
    setText("");
    if (!chatting) window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }

  function newChat() {
    if (history.signedIn) history.startNew();
    else reset();
    setText("");
  }

  // F1: الضغط على الشعار (من هنا أو من صفحة أخرى) يعرض الواجهة الأولى: بعد قراءة المحفوظ، تُمسح المحادثة.
  useEffect(() => {
    if (!loaded || !consumeHomeRequest()) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- استجابة لطلب خارجي (الشعار)
    newChat();
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    // newChat ثابت المعنى؛ نعيد التشغيل عند كل طلب جديد فقط.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, homeRequests]);


  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">
        {/* F5: لا زر «محادثاتي» عائم قبل أول سؤال؛ السجل في قائمة «حسابي» وفي /me، والشريط الجانبي في المحادثة. */}
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
              {FEATURE_EXTRAS && (
                <div className="bg-ivory-50">
                  <div className="mx-auto grid max-w-6xl gap-5 px-4 py-10 sm:gap-6 sm:py-14">
                    <Reveal>
                      <PrayerCard adhkar={adhkar} />
                    </Reveal>
                  </div>
                </div>
              )}
              <Stats reduced={reduced} />
              <HowItWorks reduced={reduced} />
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
                onAsk={ask}
                caseApi={caseApi}
                busy={busy}
                inputRef={inputRef}
                reduced={reduced}
                history={history}
                fixedHeader
              />
            </m.div>
          )}
        </AnimatePresence>
      </MotionConfig>
    </LazyMotion>
  );
}
