"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  dirForText,
  MAX_HISTORY,
  MAX_QUESTION_CHARS,
  type ChatEvent,
  type ChatHistoryItem,
  type ChatReplyKind,
  type ChatSource,
  type ChatStage,
} from "@/lib/chat/protocol";

/**
 * حالة المحادثة في المتصفح: الإرسال إلى /api/chat وقراءة البث (NDJSON)، وحفظ المحادثة
 * في localStorage (في هذا المتصفح فقط، ولا يصل إلى الخادم إلا آخر الرسائل سياقاً للمصنّف).
 */

export type UserMessage = { id: string; role: "user"; text: string; dir: "rtl" | "ltr" };

export type BotError = "rateLimited" | "network" | "busy" | "interrupted";

export type BotMessage = {
  id: string;
  role: "bot";
  status: "pending" | "streaming" | "done" | "error";
  stage?: ChatStage;
  kind?: ChatReplyKind;
  lang?: string;
  dir?: "rtl" | "ltr";
  level?: string;
  text: string;
  sources: ChatSource[];
  /** رسالة الخطأ الثابتة من الخادم (بلغة السائل)، أو مفتاح رسالة الواجهة. */
  error?: { key: BotError; text?: string };
  /** السؤال الذي يجيب عنه (لزر «أعد المحاولة»). */
  question: string;
};

export type ChatMessage = UserMessage | BotMessage;

const STORAGE_KEY = "mustafti.chat.v1";
const MAX_STORED = 60;

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function load(): ChatMessage[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { v?: number; messages?: ChatMessage[] };
    if (parsed.v !== 1 || !Array.isArray(parsed.messages)) return [];
    // جواب لم يكتمل قبل إغلاق الصفحة: يظهر منقطعاً مع زر إعادة المحاولة.
    return parsed.messages.map((m) =>
      m.role === "bot" && (m.status === "pending" || m.status === "streaming")
        ? { ...m, status: "error", error: { key: "interrupted" } }
        : m,
    );
  } catch {
    return [];
  }
}

function save(messages: ChatMessage[]) {
  try {
    if (!messages.length) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, messages: messages.slice(-MAX_STORED) }));
  } catch {
    /* تصفح خاص أو مساحة ممتلئة: المحادثة تعمل بلا حفظ */
  }
}

/** آخر الرسائل المكتملة سياقاً للمصنّف (لفهم الإلحاح والمتابعة). */
function historyOf(messages: ChatMessage[]): ChatHistoryItem[] {
  return messages
    .filter((m) => m.role === "user" || (m.status === "done" && m.text))
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text.slice(0, 1500) }));
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);

  useEffect(() => {
    // القراءة بعد التحميل فقط (localStorage غير متاح في الخادم).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages(load());
    setLoaded(true);
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
    if (loaded) save(messages);
  }, [messages, loaded]);

  const patchBot = useCallback((id: string, patch: (m: BotMessage) => Partial<BotMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id && m.role === "bot" ? { ...m, ...patch(m) } : m)));
  }, []);

  const run = useCallback(
    async (botId: string, question: string, history: ChatHistoryItem[]) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      let finished = false;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: question, history }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          patchBot(botId, () => ({ status: "error", error: { key: res.status === 429 ? "rateLimited" : "busy" } }));
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const handle = (event: ChatEvent) => {
          switch (event.type) {
            case "stage":
              patchBot(botId, () => ({ stage: event.stage }));
              break;
            case "start":
              patchBot(botId, () => ({
                status: "streaming",
                kind: event.kind,
                lang: event.lang,
                dir: event.dir,
                level: event.level,
                sources: event.sources,
                text: "",
              }));
              break;
            case "delta":
              patchBot(botId, (m) => ({ text: m.text + event.text }));
              break;
            case "done":
              finished = true;
              patchBot(botId, () => ({ status: "done" }));
              break;
            case "error":
              finished = true;
              patchBot(botId, () => ({ status: "error", error: { key: "busy", text: event.text } }));
              break;
          }
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            try {
              handle(JSON.parse(line) as ChatEvent);
            } catch {
              /* سطر غير مكتمل أو غير صالح */
            }
          }
        }
        if (!finished) patchBot(botId, () => ({ status: "error", error: { key: "interrupted" } }));
      } catch {
        // أُوقف الطلب (محادثة جديدة: الفقاعة لم تعد موجودة) أو انقطعت الشبكة.
        patchBot(botId, () => ({ status: "error", error: { key: controller.signal.aborted ? "interrupted" : "network" } }));
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [patchBot],
  );

  /** يرسل سؤالاً جديداً. */
  const send = useCallback(
    (raw: string) => {
      const question = raw.trim().slice(0, MAX_QUESTION_CHARS);
      // سؤال واحد في كل مرة: لا إرسال حتى يكتمل الجواب الجاري.
      const pending = messagesRef.current.some((m) => m.role === "bot" && (m.status === "pending" || m.status === "streaming"));
      if (!question || pending) return;
      const history = historyOf(messagesRef.current);
      const botId = newId();
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "user", text: question, dir: dirForText(question) },
        { id: botId, role: "bot", status: "pending", text: "", sources: [], question },
      ]);
      void run(botId, question, history);
    },
    [run],
  );

  /** يعيد إرسال سؤال جواب لم يكتمل (في الفقاعة نفسها). */
  const retry = useCallback(
    (botId: string) => {
      const index = messagesRef.current.findIndex((m) => m.id === botId);
      const bot = messagesRef.current[index];
      if (!bot || bot.role !== "bot") return;
      patchBot(botId, () => ({ status: "pending", stage: undefined, error: undefined, text: "", sources: [], kind: undefined }));
      void run(botId, bot.question, historyOf(messagesRef.current.slice(0, Math.max(0, index - 1))));
    },
    [patchBot, run],
  );

  /** محادثة جديدة: يوقف أي جواب جارٍ ويمسح المحفوظ. */
  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
  }, []);

  const busy = messages.some((m) => m.role === "bot" && (m.status === "pending" || m.status === "streaming"));

  return { messages, send, retry, reset, busy, loaded };
}
