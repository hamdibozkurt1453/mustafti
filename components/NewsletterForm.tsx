"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

type State = "idle" | "sending" | "ok" | "already" | "invalid" | "limited" | "error";

/**
 * F3: الاشتراك في النشرة البريدية (التذييل): حقل البريد وزر «اشترك» في صف واحد، ورسالة النتيجة تحته.
 * التحقق الحقيقي وحد السبام في الخادم (/api/newsletter)، وحقل فخ مخفي للبوتات.
 */
export function NewsletterForm() {
  const t = useTranslations("newsletter");
  const locale = useLocale();
  const [state, setState] = useState<State>("idle");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setState("sending");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), website: data.get("website"), lang: locale }),
      });
      const json = (await res.json().catch(() => ({}))) as { outcome?: State };
      setState(json.outcome && json.outcome !== "idle" && json.outcome !== "sending" ? json.outcome : "error");
    } catch {
      setState("error");
    }
  }

  const done = state === "ok" || state === "already";
  const message = state === "idle" || state === "sending" ? null : state === "ok" ? t("success") : t(state);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-display text-lg font-semibold">{t("title")}</p>
        <p className="text-sm text-ivory-50/60">{t("hint")}</p>
      </div>
      <form onSubmit={onSubmit} className="w-full sm:w-auto sm:min-w-[380px]" noValidate>
        <div className="flex gap-2 rounded-full border border-ivory-50/15 bg-ivory-50/[0.06] p-1.5 transition-colors focus-within:border-gold-500/70">
          <label htmlFor="newsletter-email" className="sr-only">
            {t("label")}
          </label>
          <input
            id="newsletter-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            dir="ltr"
            maxLength={254}
            placeholder={t("placeholder")}
            disabled={done}
            className="min-w-0 flex-1 bg-transparent px-4 text-sm text-ivory-50 outline-none placeholder:text-ivory-50/40 disabled:opacity-60"
          />
          {/* فخ للبوتات: لا يراه الإنسان ولا يصل إليه بلوحة المفاتيح. */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
          <button
            type="submit"
            disabled={state === "sending" || done}
            className="mf-press flex-none rounded-full bg-gold-500 px-5 py-2 text-sm font-semibold text-green-900 transition hover:brightness-105 disabled:opacity-70"
          >
            {state === "sending" ? t("sending") : done ? "✓" : t("submit")}
          </button>
        </div>
        <p role="status" aria-live="polite" className={`mt-2 min-h-5 px-4 text-xs ${done ? "text-gold-500" : "text-ivory-50/70"}`}>
          {message}
        </p>
      </form>
    </div>
  );
}
