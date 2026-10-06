"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { createPost, createThread, reportContent, setExpertAnswer, type ForumResult } from "@/lib/forum/actions";
import { FORUM_CATEGORIES, LIMITS, REPORT_REASONS, type ReportReason } from "@/lib/forum/rules";
import { CloseIcon } from "../icons";

/**
 * نماذج «الحوار» (R4): موضوع جديد، ورد، وإبلاغ، وتمييز «جواب مختص».
 * كل فعل Server Action يفحص الدور والحارس وحد السبام في الخادم؛ الواجهة تعرض السبب فقط.
 */

type Failure = Extract<ForumResult, { ok: false }>;

function useErrorText() {
  const t = useTranslations("forum.errors");
  return (res: Failure) => (res.error === "rejected" ? t(`rejected.${res.reason}`) : t(res.error));
}

const field =
  "w-full rounded-2xl border border-sand-200 bg-white px-4 py-3 text-green-900 outline-none transition-colors placeholder:text-ink-600/70 focus:border-green-600";
const primary =
  "mf-press inline-flex items-center justify-center rounded-full bg-green-900 px-6 py-3 font-semibold text-ivory-50 transition hover:bg-green-600 disabled:opacity-60";

function ErrorLine({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="rounded-xl bg-alert-600/10 px-4 py-2.5 text-sm font-semibold text-alert-600">
      {text}
    </p>
  );
}

export function NewThreadForm() {
  const t = useTranslations("forum");
  const locale = useLocale();
  const router = useRouter();
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await createThread({
      title: String(data.get("title") ?? ""),
      body: String(data.get("body") ?? ""),
      category: String(data.get("category") ?? ""),
      lang: locale,
    }).catch((): Failure => ({ ok: false, error: "generic" }));
    if (!res.ok) {
      setBusy(false);
      setError(errorText(res));
      return;
    }
    router.push(`/forum/${res.id}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label htmlFor="forum-title" className="mb-1.5 block text-sm font-semibold text-green-900">
          {t("new.titleLabel")}
        </label>
        <input id="forum-title" name="title" required minLength={LIMITS.titleMin} maxLength={LIMITS.titleMax} dir="auto" className={field} />
      </div>
      <div>
        <label htmlFor="forum-category" className="mb-1.5 block text-sm font-semibold text-green-900">
          {t("new.categoryLabel")}
        </label>
        <select id="forum-category" name="category" required defaultValue="general" className={field}>
          {FORUM_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`categories.${c}`)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="forum-body" className="mb-1.5 block text-sm font-semibold text-green-900">
          {t("new.bodyLabel")}
        </label>
        <textarea
          id="forum-body"
          name="body"
          required
          minLength={LIMITS.threadBodyMin}
          maxLength={LIMITS.bodyMax}
          rows={8}
          dir="auto"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("new.bodyPlaceholder")}
          className={field}
        />
        <p className="mt-1 text-end text-xs tabular-nums text-ink-600">{t("new.counter", { count: body.length, max: LIMITS.bodyMax })}</p>
      </div>
      <ErrorLine text={error} />
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className={primary}>
          {busy ? t("new.submitting") : t("new.submit")}
        </button>
        <button type="button" onClick={() => router.push("/forum")} className="rounded-full px-5 py-3 font-semibold text-green-900 hover:bg-green-900/5">
          {t("new.cancel")}
        </button>
      </div>
    </form>
  );
}

export function ReplyForm({ threadId, expert }: { threadId: string; expert: boolean }) {
  const t = useTranslations("forum.thread");
  const router = useRouter();
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [asExpert, setAsExpert] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createPost({ threadId, body, expertAnswer: expert && asExpert }).catch((): Failure => ({ ok: false, error: "generic" }));
    setBusy(false);
    if (!res.ok) {
      setError(errorText(res));
      return;
    }
    setBody("");
    setAsExpert(false);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label htmlFor="forum-reply" className="sr-only">
        {t("replyTitle")}
      </label>
      <textarea
        id="forum-reply"
        required
        minLength={LIMITS.postBodyMin}
        maxLength={LIMITS.bodyMax}
        rows={5}
        dir="auto"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("replyPlaceholder")}
        className={field}
      />
      {expert && (
        <label className="flex items-center gap-2 text-sm font-semibold text-green-900">
          <input type="checkbox" checked={asExpert} onChange={(e) => setAsExpert(e.target.checked)} className="h-4 w-4 accent-green-600" />
          {t("markAsExpertOnPost")}
        </label>
      )}
      <ErrorLine text={error} />
      <button type="submit" disabled={busy || !body.trim()} className={primary}>
        {busy ? t("sending") : t("send")}
      </button>
    </form>
  );
}

/** المختص المقبول يميّز رده «جواب مختص» أو يلغي التمييز. */
export function ExpertAnswerToggle({ postId, marked }: { postId: string; marked: boolean }) {
  const t = useTranslations("forum.thread");
  const router = useRouter();
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    const res = await setExpertAnswer({ postId, value: !marked }).catch((): Failure => ({ ok: false, error: "generic" }));
    setBusy(false);
    if (!res.ok) setError(errorText(res));
    else router.refresh();
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={toggle}
        className="rounded-full border border-green-600/40 px-3 py-1 text-xs font-semibold text-green-900 transition hover:bg-green-600 hover:text-ivory-50 disabled:opacity-60"
      >
        {marked ? t("unmarkExpert") : t("markExpert")}
      </button>
      {error && (
        <span role="alert" className="text-xs text-alert-600">
          {error}
        </span>
      )}
    </span>
  );
}

/** زر «إبلاغ» ونافذة السبب. للزائر: رابط الدخول بدل النافذة. */
export function ReportButton({ targetType, targetId, signedIn, loginHref }: { targetType: "thread" | "post"; targetId: string; signedIn: boolean; loginHref: string }) {
  const t = useTranslations("forum.report");
  const errorText = useErrorText();
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<ReportReason>("abuse");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const trigger = "rounded-full px-2.5 py-1 text-xs font-semibold text-ink-600 transition hover:bg-alert-600/10 hover:text-alert-600";

  if (!signedIn) {
    return (
      <a href={loginHref} className={trigger} title={t("loginToReport")}>
        <span aria-hidden>⚑ </span>
        {t("button")}
      </a>
    );
  }

  function close() {
    ref.current?.close();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await reportContent({ targetType, targetId, reason, note: note.trim() || undefined }).catch((): Failure => ({ ok: false, error: "generic" }));
    setBusy(false);
    if (!res.ok) setError(errorText(res));
    else setSent(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setSent(false);
          ref.current?.showModal();
        }}
        className={trigger}
      >
        <span aria-hidden>⚑ </span>
        {t("button")}
      </button>
      <dialog
        ref={ref}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        aria-labelledby={`report-${targetId}`}
        className="m-0 mt-auto w-full max-w-none rounded-t-[28px] bg-ivory-50 p-0 text-green-900 backdrop:bg-green-900/50 backdrop:backdrop-blur-sm sm:m-auto sm:max-w-md sm:rounded-[28px]"
      >
        <form onSubmit={submit} className="space-y-4 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="flex items-start justify-between gap-4">
            <h2 id={`report-${targetId}`} className="font-display text-2xl font-semibold">
              {t("title")}
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label={t("cancel")}
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white text-green-900 ring-1 ring-sand-200 transition hover:ring-green-600"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
          {sent ? (
            <p role="status" className="rounded-xl bg-green-600/10 px-4 py-3 font-semibold text-green-900">
              {t("sent")}
            </p>
          ) : (
            <>
              <p className="text-sm text-ink-600">{t("lead")}</p>
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-semibold">{t("reasonLabel")}</legend>
                {REPORT_REASONS.map((r) => (
                  <label key={r} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-sand-200 has-[:checked]:ring-green-600">
                    <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-green-600" />
                    {t(`reasons.${r}`)}
                  </label>
                ))}
              </fieldset>
              <div>
                <label htmlFor={`report-note-${targetId}`} className="mb-1 block text-sm font-semibold">
                  {t("noteLabel")}
                </label>
                <textarea
                  id={`report-note-${targetId}`}
                  rows={3}
                  maxLength={LIMITS.noteMax}
                  dir="auto"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className={field}
                />
              </div>
              <ErrorLine text={error} />
              <div className="flex flex-wrap gap-3">
                <button type="submit" disabled={busy} className="mf-press rounded-full bg-alert-600 px-5 py-2.5 font-semibold text-ivory-50 hover:brightness-110 disabled:opacity-60">
                  {busy ? t("sending") : t("submit")}
                </button>
                <button type="button" onClick={close} className="rounded-full px-5 py-2.5 font-semibold text-green-900 hover:bg-green-900/5">
                  {t("cancel")}
                </button>
              </div>
            </>
          )}
        </form>
      </dialog>
    </>
  );
}
