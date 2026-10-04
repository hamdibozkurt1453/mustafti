"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAffirmative } from "@/lib/case/affirm";
import type { CaseAnswer, CaseDraft, CasePlan, PlanQuestion, ReferralKind } from "@/lib/case/types";
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
 *
 * ومسار المستوى D في المحادثة نفسها (lib/case/): بعد رسالة الإحالة، زر «ابدأ» أو ردّ بالموافقة
 * («نعم، ساعدني») يبدأ الاستيضاح: سؤال واحد في كل رسالة (الخطة من /api/case/clarify)، ثم ملف
 * المسألة للمراجعة (/api/case/draft)، ثم «أوافق وأرسل» (/api/case/submit) ورابط المتابعة.
 */

/** case: جواب عن سؤال استيضاح (لا يُرسل سياقاً للمصنّف). skipped: «تخطَّ». */
export type UserMessage = { id: string; role: "user"; text: string; dir: "rtl" | "ltr"; case?: boolean; skipped?: boolean };

export type BotError = "rateLimited" | "network" | "busy" | "interrupted";

/** رسائل مسار الاستيضاح: سؤال، أو ملف المسألة، أو تنبيه (الإلغاء). */
export type CaseKind = "clarify" | "caseFile" | "caseNote";

export type CaseFileState = {
  draft: CaseDraft;
  token?: string;
  routeTo?: "mufti" | "mentor";
  linked?: boolean;
};

export type BotMessage = {
  id: string;
  role: "bot";
  status: "pending" | "streaming" | "done" | "error";
  stage?: ChatStage;
  kind?: ChatReplyKind | CaseKind;
  /** للإحالة والامتناع: ما يلزم لبدء الاستيضاح. */
  referral?: ReferralKind;
  chapter?: string;
  userType?: string;
  /** لرسائل الاستيضاح: الملف الذي تنتمي إليه ومرحلة الانتظار. */
  flowId?: string;
  caseStage?: "planning" | "drafting" | "submitting";
  clarify?: { index: number; total: number; question: PlanQuestion };
  caseFile?: CaseFileState;
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

export type CaseStep = "planning" | "asking" | "drafting" | "review" | "submitting" | "submitted" | "cancelled";

/** الاستيضاح الجاري (واحد في كل مرة). */
export type CaseFlow = {
  id: string;
  /** رسالة الإحالة التي بدأ منها. */
  sourceId: string;
  question: string;
  lang: string;
  dir: "rtl" | "ltr";
  chapter?: string;
  userType?: string;
  kind: ReferralKind;
  step: CaseStep;
  plan?: CasePlan;
  index: number;
  answers: CaseAnswer[];
  /** رسالة مُستفتي التي تعرض الانتظار أو الخطأ الآن. */
  botId: string;
  failed?: boolean;
};

export type SubmitInput = { draft: CaseDraft; edited: { summary: boolean; rows: string[] }; email: string };

const STORAGE_KEY = "mustafti.chat.v1";
const MAX_STORED = 60;

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type Stored = { messages: ChatMessage[]; flow: CaseFlow | null };

function load(): Stored {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { messages: [], flow: null };
    const parsed = JSON.parse(raw) as { v?: number; messages?: ChatMessage[]; flow?: CaseFlow | null };
    if (parsed.v !== 1 || !Array.isArray(parsed.messages)) return { messages: [], flow: null };
    // جواب لم يكتمل قبل إغلاق الصفحة: يظهر منقطعاً مع زر إعادة المحاولة.
    const messages = parsed.messages.map((m) =>
      m.role !== "bot"
        ? m
        : m.status === "pending" || m.status === "streaming"
          ? { ...m, status: "error" as const, error: { key: "interrupted" as const } }
          : m.caseStage
            ? { ...m, caseStage: undefined }
            : m,
    );
    // خطوة انتظار انقطعت: تُعاد من زر «أعد المحاولة».
    const flow = parsed.flow ?? null;
    const waiting = flow && (flow.step === "planning" || flow.step === "drafting" || flow.step === "submitting");
    return { messages, flow: waiting ? { ...flow, failed: true } : flow };
  } catch {
    return { messages: [], flow: null };
  }
}

function save(messages: ChatMessage[], flow: CaseFlow | null) {
  try {
    if (!messages.length) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, messages: messages.slice(-MAX_STORED), flow }));
  } catch {
    /* تصفح خاص أو مساحة ممتلئة: المحادثة تعمل بلا حفظ */
  }
}

async function postJson<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; status: number; error?: string }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!res.ok || !data) return { ok: false, status: res.status, error: data?.error };
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0 };
  }
}

const CASE_KINDS: readonly string[] = ["clarify", "caseFile", "caseNote"];

/** آخر الرسائل المكتملة سياقاً للمصنّف (لفهم الإلحاح والمتابعة). */
function historyOf(messages: ChatMessage[]): ChatHistoryItem[] {
  return messages
    .filter((m) => (m.role === "user" ? !m.case : !CASE_KINDS.includes(m.kind ?? "")))
    .filter((m) => m.role === "user" || (m.status === "done" && m.text))
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text.slice(0, 1500) }));
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [flow, setFlowState] = useState<CaseFlow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const flowRef = useRef<CaseFlow | null>(null);

  useEffect(() => {
    // القراءة بعد التحميل فقط (localStorage غير متاح في الخادم).
    const stored = load();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages(stored.messages);
    setFlowState(stored.flow);
    flowRef.current = stored.flow;
    setLoaded(true);
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
    if (loaded) save(messages, flow);
  }, [messages, flow, loaded]);

  /** أُلغي هذا الاستيضاح أو بدأ غيره أثناء انتظار الخادم؟ */
  const stale = (f: CaseFlow) => flowRef.current?.id !== f.id || flowRef.current.step === "cancelled";

  /** يحدّث الاستيضاح الجاري (والمرجع فوراً، فلا تنتظر الخطوة التالية إعادة الرسم). */
  const setFlow = useCallback((next: CaseFlow | null) => {
    flowRef.current = next;
    setFlowState(next);
  }, []);

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
                referral: event.referral,
                chapter: event.chapter ?? undefined,
                userType: event.userType ?? undefined,
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

  // -------------------------------------------------------------------------
  // الاستيضاح وملف المسألة
  // -------------------------------------------------------------------------

  const pushBot = useCallback((msg: Omit<BotMessage, "id" | "role" | "sources" | "question"> & { question?: string }) => {
    const id = newId();
    setMessages((prev) => [...prev, { id, role: "bot", sources: [], question: "", ...msg }]);
    return id;
  }, []);

  /** يعرض سؤال الاستيضاح رقم index في فقاعة botId. */
  const showQuestion = useCallback(
    (f: CaseFlow, index: number, botId: string) => {
      const plan = f.plan!;
      patchBot(botId, () => ({
        status: "done",
        kind: "clarify",
        caseStage: undefined,
        flowId: f.id,
        lang: plan.lang,
        dir: f.dir,
        text: plan.questions[index].text,
        clarify: { index, total: plan.questions.length, question: plan.questions[index] },
      }));
    },
    [patchBot],
  );

  const draftStep = useCallback(
    async (f: CaseFlow) => {
      patchBot(f.botId, () => ({ status: "pending", kind: "caseFile", caseStage: "drafting", flowId: f.id, error: undefined }));
      setFlow({ ...f, step: "drafting", failed: false });
      const res = await postJson<{ draft: CaseDraft }>("/api/case/draft", { question: f.question, plan: f.plan, answers: f.answers });
      if (stale(f)) return; // أُلغي أو بدأ غيره
      if (!res.ok) {
        patchBot(f.botId, () => ({ status: "error", error: { key: res.status === 429 ? "rateLimited" : "busy" } }));
        setFlow({ ...f, step: "drafting", failed: true });
        return;
      }
      patchBot(f.botId, () => ({ status: "done", caseStage: undefined, dir: f.dir, lang: f.lang, caseFile: { draft: res.data.draft } }));
      setFlow({ ...f, step: "review", failed: false });
    },
    [patchBot, setFlow],
  );

  const planStep = useCallback(
    async (f: CaseFlow) => {
      patchBot(f.botId, () => ({ status: "pending", kind: "clarify", caseStage: "planning", flowId: f.id, error: undefined }));
      setFlow({ ...f, step: "planning", failed: false });
      const res = await postJson<{ plan: CasePlan }>("/api/case/clarify", {
        question: f.question,
        lang: f.lang,
        chapter: f.chapter ?? null,
        userType: f.userType ?? null,
        kind: f.kind,
      });
      if (stale(f)) return;
      if (!res.ok) {
        patchBot(f.botId, () => ({ status: "error", error: { key: res.status === 429 ? "rateLimited" : "busy" } }));
        setFlow({ ...f, step: "planning", failed: true });
        return;
      }
      const plan = res.data.plan;
      const next: CaseFlow = { ...f, plan, lang: plan.lang, index: 0, answers: [], step: "asking", failed: false };
      if (!plan.questions.length) {
        await draftStep(next);
        return;
      }
      setFlow(next);
      showQuestion(next, 0, f.botId);
    },
    [draftStep, patchBot, setFlow, showQuestion],
  );

  /** «ابدأ»: يبدأ الاستيضاح لرسالة إحالة (أو امتناع) في المحادثة نفسها. */
  const startCase = useCallback(
    (sourceId: string) => {
      const source = messagesRef.current.find((m): m is BotMessage => m.id === sourceId && m.role === "bot");
      const current = flowRef.current;
      const active = current && current.step !== "cancelled" && current.step !== "submitted" && current.step !== "review";
      if (!source || !source.question || (active && current.sourceId === sourceId)) return;
      abortRef.current?.abort();
      const lang = source.lang ?? "ar";
      const botId = pushBot({ status: "pending", kind: "clarify", caseStage: "planning", text: "", dir: source.dir });
      const f: CaseFlow = {
        id: newId(),
        sourceId,
        question: source.question,
        lang,
        dir: source.dir ?? dirForText(source.question),
        chapter: source.chapter,
        userType: source.userType,
        kind: source.referral ?? "personal",
        step: "planning",
        index: 0,
        answers: [],
        botId,
      };
      void planStep(f);
    },
    [planStep, pushBot],
  );

  /** جواب سؤال الاستيضاح الحالي (value = null ⇒ تخطَّ). label: ما يظهر في فقاعة السائل. */
  const answerCase = useCallback(
    (value: string | null, label?: string) => {
      const f = flowRef.current;
      if (!f || f.step !== "asking" || !f.plan) return;
      const q = f.plan.questions[f.index];
      const shown = (label ?? value ?? "").trim().slice(0, 600);
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "user", text: value === null ? "" : shown, dir: dirForText(shown || f.question), case: true, skipped: value === null },
      ]);
      const answers = [...f.answers.filter((a) => a.key !== q.key), { key: q.key, value: value === null ? null : value.trim().slice(0, 600) }];
      const index = f.index + 1;
      const botId = pushBot({ status: "pending", kind: "clarify", text: "", dir: f.dir, flowId: f.id });
      const next: CaseFlow = { ...f, answers, index, botId };
      if (index < f.plan.questions.length) {
        setFlow(next);
        showQuestion(next, index, botId);
      } else {
        void draftStep(next);
      }
    },
    [draftStep, pushBot, setFlow, showQuestion],
  );

  /** «إلغاء»: يوقف الاستيضاح، ولا يُحفظ شيء. */
  const cancelCase = useCallback(() => {
    const f = flowRef.current;
    if (!f || f.step === "submitted" || f.step === "cancelled" || f.step === "submitting") return;
    setFlow({ ...f, step: "cancelled", failed: false });
    // فقاعة الانتظار أو الخطأ لا تبقى معلّقة.
    setMessages((prev) => prev.filter((m) => !(m.id === f.botId && m.role === "bot" && m.status !== "done")));
    pushBot({ status: "done", kind: "caseNote", text: "", dir: f.dir, flowId: f.id });
  }, [pushBot, setFlow]);

  /** «أوافق وأرسل». */
  const submitCase = useCallback(
    async (input: SubmitInput): Promise<"ok" | "bad_email" | "error"> => {
      const f = flowRef.current;
      if (!f || (f.step !== "review" && !(f.step === "submitting" && f.failed))) return "error";
      setFlow({ ...f, step: "submitting", failed: false });
      patchBot(f.botId, (m) => ({ caseStage: "submitting", caseFile: m.caseFile ? { ...m.caseFile, draft: input.draft } : { draft: input.draft } }));
      const res = await postJson<{ token: string; routeTo: "mufti" | "mentor"; linked: boolean }>("/api/case/submit", {
        lang: f.plan?.lang ?? f.lang,
        chapter: f.plan?.chapter ?? "other",
        userType: f.userType ?? null,
        kind: f.kind,
        draft: input.draft,
        edited: input.edited,
        email: input.email.trim(),
      });
      if (stale(f)) return "error";
      if (!res.ok) {
        setFlow({ ...f, step: "review", failed: true });
        patchBot(f.botId, () => ({ caseStage: undefined }));
        return res.error === "bad_email" ? "bad_email" : "error";
      }
      patchBot(f.botId, (m) => ({
        caseStage: undefined,
        caseFile: { ...m.caseFile, draft: input.draft, token: res.data.token, routeTo: res.data.routeTo, linked: res.data.linked },
      }));
      setFlow({ ...f, step: "submitted", failed: false });
      return "ok";
    },
    [patchBot, setFlow],
  );

  /** إعادة خطوة تعذّرت (تجهيز الأسئلة أو الملف). */
  const retryCase = useCallback(() => {
    const f = flowRef.current;
    if (!f) return;
    if (f.step === "planning") void planStep(f);
    else if (f.step === "drafting") void draftStep(f);
  }, [draftStep, planStep]);

  /** يرسل سؤالاً جديداً (أو جواب سؤال الاستيضاح الجاري، أو موافقة على رسالة الإحالة). */
  const send = useCallback(
    (raw: string) => {
      const question = raw.trim().slice(0, MAX_QUESTION_CHARS);
      // سؤال واحد في كل مرة: لا إرسال حتى يكتمل الجواب الجاري.
      const pending = messagesRef.current.some((m) => m.role === "bot" && (m.status === "pending" || m.status === "streaming"));
      if (!question || pending) return;

      // أثناء الاستيضاح: ما يُكتب جواب السؤال الحالي.
      const f = flowRef.current;
      if (f?.step === "asking") {
        answerCase(question);
        return;
      }
      // «نعم، ساعدني» بعد رسالة الإحالة: يبدأ الاستيضاح ولا تتكرر الإحالة.
      const last = messagesRef.current[messagesRef.current.length - 1];
      if (
        last?.role === "bot" &&
        last.kind === "referral" &&
        last.status === "done" &&
        (!f || f.sourceId !== last.id || f.step === "cancelled") &&
        isAffirmative(question)
      ) {
        setMessages((prev) => [...prev, { id: newId(), role: "user", text: question, dir: dirForText(question), case: true }]);
        startCase(last.id);
        return;
      }
      const history = historyOf(messagesRef.current);
      const botId = newId();
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "user", text: question, dir: dirForText(question) },
        { id: botId, role: "bot", status: "pending", text: "", sources: [], question },
      ]);
      void run(botId, question, history);
    },
    [answerCase, run, startCase],
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
    setFlow(null);
  }, [setFlow]);

  const busy = messages.some((m) => m.role === "bot" && (m.status === "pending" || m.status === "streaming"));

  const caseApi = { flow, start: startCase, answer: answerCase, cancel: cancelCase, submit: submitCase, retry: retryCase };

  return { messages, send, retry, reset, busy, loaded, caseApi };
}
