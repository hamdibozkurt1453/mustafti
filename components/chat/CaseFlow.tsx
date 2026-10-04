"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { dirForText } from "@/lib/chat/protocol";
import type { CaseDraft } from "@/lib/case/types";
import type { BotMessage, CaseFlow, SubmitInput } from "./useChat";

/**
 * واجهة الاستيضاح وملف المسألة داخل المحادثة:
 *   ClarifyBubble ← سؤال واحد بأزرار الخيارات وشريط التقدم و«تخطَّ» و«إلغاء».
 *   CaseReview    ← ملف المسألة للمراجعة والتعديل الحر، ثم «أوافق وأرسل»، ثم رابط المتابعة.
 */

export type CaseApi = {
  flow: CaseFlow | null;
  start: (sourceId: string) => void;
  answer: (value: string | null, label?: string) => void;
  cancel: () => void;
  submit: (input: SubmitInput) => Promise<"ok" | "bad_email" | "error">;
  retry: () => void;
};

const bubble = "rounded-[22px] rounded-se-md border border-sand-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-green-900 sm:text-base";
const chip =
  "rounded-full border border-green-600/40 bg-white px-3.5 py-1.5 text-sm font-semibold text-green-900 transition hover:border-green-600 hover:bg-green-600 hover:text-ivory-50 active:scale-95";
const ghost = "rounded-full px-3 py-1 text-xs font-semibold text-ink-600 underline-offset-4 transition hover:text-green-900 hover:underline";

/** «ابدأ»: يفتح الاستيضاح في المحادثة نفسها. */
export function StartCaseButton({ label, onStart }: { label: string; onStart: () => void }) {
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={onStart}
        className="inline-flex items-center gap-2 rounded-full bg-gold-500 px-5 py-2 text-sm font-semibold text-green-900 transition hover:brightness-105 active:scale-95"
      >
        {label}
        <span aria-hidden className="rtl:-scale-x-100">
          →
        </span>
      </button>
    </div>
  );
}

export function Progress({ n, total }: { n: number; total: number }) {
  const t = useTranslations("case");
  return (
    <div className="mb-3">
      <p className="mb-1.5 text-xs font-semibold text-green-600">{t("progress", { n, total })}</p>
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={n}
        className="h-1.5 overflow-hidden rounded-full bg-sand-200/70"
      >
        <div className="h-full rounded-full bg-gold-500 transition-[width] duration-500" style={{ width: `${(n / total) * 100}%` }} />
      </div>
    </div>
  );
}

/** سؤال استيضاح واحد. الأزرار تظهر للسؤال الحالي فقط. */
export function ClarifyBubble({ msg, api }: { msg: BotMessage; api: CaseApi }) {
  const t = useTranslations("case");
  const c = msg.clarify!;
  const f = api.flow;
  const active = f?.id === msg.flowId && f?.step === "asking" && f.index === c.index;
  const q = c.question;

  return (
    <div className={bubble}>
      <Progress n={c.index + 1} total={c.total} />
      {q.generated && (
        <span className="mb-1.5 inline-block rounded-full bg-gold-50 px-2.5 py-0.5 text-[11px] font-semibold text-green-900 ring-1 ring-gold-500/50">
          {t("generated")}
        </span>
      )}
      <p dir={msg.dir} className="font-semibold">
        {msg.text}
      </p>
      {q.why && (
        <p dir={msg.dir} className="mt-1 text-xs leading-relaxed text-ink-600">
          <span className="font-semibold text-green-600">{t("why")}</span> {q.why}
        </p>
      )}
      {active && (
        <div className="mf-rise">
          {q.options.length > 0 && (
            <div dir={msg.dir} className="mt-3 flex flex-wrap gap-2">
              {q.options.map((o) => (
                <button key={o.value} type="button" className={chip} onClick={() => api.answer(o.value, o.label)}>
                  {o.label}
                </button>
              ))}
              {q.type === "choice" && (
                <button
                  type="button"
                  className={`${chip} border-dashed`}
                  onClick={() => document.querySelector<HTMLTextAreaElement>("#q-dock")?.focus()}
                >
                  {t("other")}
                </button>
              )}
            </div>
          )}
          <p className="mt-3 text-xs text-ink-600">{t("typeHint")}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <button type="button" className={ghost} onClick={() => api.answer(null)}>
              {t("skip")}
            </button>
            <button type="button" className={ghost} onClick={api.cancel}>
              {t("cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-green-600">{label}</span>
      {children}
    </label>
  );
}

const input =
  "w-full rounded-xl border border-sand-200 bg-ivory-50/60 px-3 py-2 text-[15px] leading-relaxed text-green-900 outline-none transition focus:border-green-600 focus:bg-white";

/** ملف المسألة: مراجعة وتعديل حر، ثم «أوافق وأرسل»، ثم رابط المتابعة. */
export function CaseReview({ msg, api }: { msg: BotMessage; api: CaseApi }) {
  const t = useTranslations("case");
  const locale = useLocale();
  const state = msg.caseFile!;
  const f = api.flow;
  const mine = f?.id === msg.flowId && !state.token && (f?.step === "review" || f?.step === "submitting");
  const sending = mine && f?.step === "submitting";
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLElement>(null);

  // البطاقة تظهر من أولها (لا زر الإرسال وحده في أسفل الشاشة).
  useEffect(() => {
    if (mine && !state.token) ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [draft, setDraft] = useState<CaseDraft>(state.draft);
  const [edited, setEdited] = useState<{ summary: boolean; rows: string[] }>({ summary: false, rows: [] });
  const [email, setEmail] = useState("");
  const [error, setError] = useState<"error" | "bad_email" | null>(null);
  const [copied, setCopied] = useState(false);

  const lang = f?.plan?.lang ?? msg.lang ?? "ar";
  const dir = msg.dir ?? dirForText(draft.question);

  if (state.token) {
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/${locale}/case/${state.token}`;
    return (
      <div className={`${bubble} border-green-600/40`} role="status">
        <p className="flex items-center gap-2 font-semibold">
          <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-green-600 text-xs text-ivory-50">
            ✓
          </span>
          {t("sentTitle")}
        </p>
        <p className="mt-2 text-sm">{state.routeTo === "mentor" ? t("routeMentor") : t("routeMufti")}</p>
        <p className="mt-2 text-sm text-ink-600">
          {t("sentLead")} {state.linked ? t("sentLinked") : ""}
        </p>
        <p dir="ltr" className="mt-3 break-all rounded-xl bg-ivory-50 px-3 py-2 font-mono text-xs text-green-900 ring-1 ring-sand-200">
          {url}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={chip}
            onClick={() => {
              void navigator.clipboard?.writeText(url).then(() => setCopied(true));
            }}
          >
            {copied ? t("copied") : t("copy")}
          </button>
          <a href={url} className="rounded-full bg-gold-500 px-4 py-1.5 text-sm font-semibold text-green-900 transition hover:brightness-105">
            {t("open")}
          </a>
        </div>
      </div>
    );
  }

  async function approve() {
    setError(null);
    const result = await api.submit({ draft, edited, email });
    if (result !== "ok") setError(result);
  }

  const setRow = (key: string, value: string) => {
    setDraft((d) => ({ ...d, rows: d.rows.map((r) => (r.key === key ? { ...r, value } : r)) }));
    setEdited((e) => (e.rows.includes(key) ? e : { ...e, rows: [...e.rows, key] }));
  };

  // لا إرسال بزر Enter: الإرسال بالضغط الصريح على «أوافق وأرسل» فقط.
  const noEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
  };

  return (
    <section ref={ref} aria-label={t("reviewTitle")} onKeyDown={noEnter} className={`${bubble} scroll-mt-24 space-y-4 border-gold-500/70 ring-1 ring-gold-500/40`}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-green-600">{t("reviewStep")}</p>
        <p className="mt-1 text-lg font-bold">{t("reviewTitle")}</p>
        <p className="mt-1 text-sm text-ink-600">{t("reviewLead")}</p>
        {mine && !sending && <p className="mt-2 rounded-xl bg-gold-50 px-3 py-2 text-xs font-semibold text-green-900 ring-1 ring-gold-500/40">{t("notSentYet")}</p>}
      </div>

      <Field label={t("question")}>
        {editing ? (
          <textarea dir={dir} rows={2} value={draft.question} onChange={(e) => setDraft((d) => ({ ...d, question: e.target.value }))} className={input} />
        ) : (
          <p dir={dir} className="whitespace-pre-wrap rounded-xl bg-ivory-50 px-3 py-2">{draft.question}</p>
        )}
      </Field>

      <Field label={t("summary")}>
        {editing ? (
          <textarea
            dir={dir}
            rows={5}
            value={draft.summaryUser}
            onChange={(e) => {
              setDraft((d) => ({ ...d, summaryUser: e.target.value }));
              setEdited((x) => ({ ...x, summary: true }));
            }}
            className={input}
          />
        ) : (
          <p dir={dir} className="whitespace-pre-wrap leading-relaxed">{draft.summaryUser}</p>
        )}
      </Field>

      {lang !== "ar" && (
        <details className="rounded-xl bg-ivory-50/60 px-3 py-2 text-sm">
          <summary className="cursor-pointer text-xs font-semibold text-green-600">{t("summaryAr")}</summary>
          <p dir="rtl" lang="ar" className="mt-2 whitespace-pre-wrap leading-relaxed">
            {draft.summaryAr}
          </p>
        </details>
      )}

      {draft.rows.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-green-600">{t("pillars")}</p>
          {editing ? (
            <div className="space-y-2.5">
              {draft.rows.map((r) => (
                <Field key={r.key} label={`${r.label}${r.source === "question" ? ` · ${t("fromQuestion")}` : ""}`}>
                  <input dir={dir} value={r.value} onChange={(e) => setRow(r.key, e.target.value)} className={input} />
                </Field>
              ))}
            </div>
          ) : (
            <dl dir={dir} className="divide-y divide-sand-200 rounded-xl border border-sand-200 text-sm">
              {draft.rows.map((r) => (
                <div key={r.key} className="grid gap-0.5 px-3 py-2">
                  <dt className="text-ink-600">{r.label}</dt>
                  <dd className="font-semibold">{r.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-semibold text-green-600">{t("unknowns")}</p>
        {draft.unknowns.length ? (
          <ul dir={dir} className="list-inside list-disc space-y-0.5 text-sm text-ink-600">
            {draft.unknowns.map((u) => (
              <li key={u.key}>{u.label}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-600">{t("noUnknowns")}</p>
        )}
      </div>

      {mine && (
        <>
          <Field label={t("email")}>
            <input
              type="email"
              dir="ltr"
              disabled={sending}
              autoComplete="email"
              enterKeyHint="done"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={input}
              aria-describedby={`email-hint-${msg.id}`}
            />
            <span id={`email-hint-${msg.id}`} className="mt-1 block text-[11px] text-ink-600">
              {t("emailHint")}
            </span>
          </Field>
          {error && (
            <p role="alert" className="text-sm font-semibold text-alert-600">
              {error === "bad_email" ? t("errorEmail") : t("error")}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void approve()}
              disabled={sending || !draft.question.trim() || !draft.summaryUser.trim()}
              className="inline-flex items-center gap-2 rounded-full bg-green-900 px-5 py-2.5 text-sm font-semibold text-ivory-50 transition hover:bg-green-600 disabled:opacity-60"
            >
              {sending ? t("submitting") : t("approve")}
            </button>
            <button type="button" className={chip} onClick={() => setEditing((v) => !v)} disabled={sending} aria-pressed={editing}>
              {editing ? t("doneEditing") : t("edit")}
            </button>
            <button type="button" className={ghost} onClick={api.cancel} disabled={sending}>
              {t("cancel")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
