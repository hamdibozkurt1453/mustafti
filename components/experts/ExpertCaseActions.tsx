"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { claimCase, reportMissing, submitAnswer } from "@/lib/experts/actions";
import { ANSWER_LIMITS } from "@/lib/experts/types";

/** أزرار صفحة الملف عند المختص. كل فعل يُفحص في الخادم من جديد (lib/experts/actions.ts). */

function useErrors() {
  const t = useTranslations("experts.dashboard");
  return (code: string) => t(`errors.${code}` as "errors.generic");
}

export function ClaimButton({ caseId }: { caseId: string }) {
  const t = useTranslations("experts.dashboard");
  const err = useErrors();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function claim() {
    setBusy(true);
    setError(null);
    const res = await claimCase(caseId).catch(() => ({ ok: false as const, error: "generic" }));
    setBusy(false);
    if (!res.ok) setError(err(res.error));
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-600">{t("claimHint")}</p>
      <button
        type="button"
        onClick={claim}
        disabled={busy}
        className="rounded-full bg-gold-500 px-6 py-3 font-semibold text-green-900 disabled:opacity-60"
      >
        {busy ? t("claiming") : t("claim")}
      </button>
      {error && (
        <p role="alert" className="text-sm text-alert-600">
          {error}
        </p>
      )}
    </div>
  );
}

export function AnswerForm({ caseId }: { caseId: string }) {
  const t = useTranslations("experts.dashboard");
  const err = useErrors();
  const router = useRouter();
  const draftKey = `mustafti:expert-answer:${caseId}`;
  const [text, setText] = useState("");

  // مسودة الجواب في المتصفح، تُستعاد بعد التحميل.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- استعادة من التخزين بعد التحميل فقط
      if (saved) setText(saved);
    } catch {}
  }, [draftKey]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function change(value: string) {
    setText(value);
    try {
      localStorage.setItem(draftKey, value);
    } catch {}
  }

  async function send() {
    if (!window.confirm(t("confirmSend"))) return;
    setBusy(true);
    setMessage(null);
    const res = await submitAnswer({ caseId, answerAr: text }).catch(() => ({ ok: false as const, error: "generic" }));
    setBusy(false);
    if (!res.ok) {
      setMessage({ ok: false, text: err(res.error) });
      return;
    }
    try {
      localStorage.removeItem(draftKey);
    } catch {}
    setMessage({ ok: true, text: res.translated ? t("sent") : t("sentNoTranslation") });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <label className="block space-y-1.5">
        <span className="text-lg font-bold">{t("answerLabel")}</span>
        <span className="block text-xs text-ink-600">{t("answerHint")}</span>
        <textarea
          dir="rtl"
          lang="ar"
          rows={10}
          maxLength={ANSWER_LIMITS.answer}
          value={text}
          onChange={(e) => change(e.target.value)}
          className="w-full rounded-xl border border-sand-200 bg-white px-4 py-3 leading-relaxed text-green-900 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20"
        />
      </label>
      <button
        type="button"
        onClick={send}
        disabled={busy || text.trim().length < 2}
        className="rounded-full bg-gold-500 px-6 py-3 font-semibold text-green-900 disabled:opacity-60"
      >
        {busy ? t("claiming") : t("approveSend")}
      </button>
      {message && (
        <p role="status" className={`text-sm ${message.ok ? "text-green-600" : "text-alert-600"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

export function MissingForm({ caseId }: { caseId: string }) {
  const t = useTranslations("experts.dashboard");
  const err = useErrors();
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    setBusy(true);
    setMessage(null);
    const res = await reportMissing({ caseId, note }).catch(() => ({ ok: false as const, error: "generic" }));
    setBusy(false);
    if (!res.ok) {
      setMessage({ ok: false, text: err(res.error) });
      return;
    }
    setNote("");
    setMessage({ ok: true, text: t("missingSent") });
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <h2 className="font-bold">{t("missingTitle")}</h2>
      <p className="text-xs text-ink-600">{t("missingHint")}</p>
      <textarea
        dir="auto"
        rows={3}
        maxLength={ANSWER_LIMITS.note}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="w-full rounded-xl border border-sand-200 bg-white px-4 py-3 text-sm text-green-900 outline-none focus:border-green-600"
      />
      <button
        type="button"
        onClick={send}
        disabled={busy || note.trim().length < 3}
        className="rounded-full border border-green-900/20 px-5 py-2 text-sm font-semibold text-green-900 disabled:opacity-60"
      >
        {t("missingSend")}
      </button>
      {message && (
        <p role="status" className={`text-sm ${message.ok ? "text-green-600" : "text-alert-600"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
