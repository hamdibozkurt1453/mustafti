"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { GlossaryTerm } from "@/lib/brain/glossary";
import { RichText } from "./RichText";
import { SourceCard } from "./SourceCard";
import type { BotMessage } from "./useChat";

/** مؤشر العمل: النقاط الثلاث مع المرحلة («يبحث في المصادر…»). */
function Working({ stage }: { stage?: BotMessage["stage"] }) {
  const t = useTranslations("chat");
  const label = t(`stage.${stage ?? "understanding"}`);
  return (
    <span className="flex items-center gap-2.5 py-1 text-sm text-ink-600" role="status">
      <span className="flex items-center gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="mf-dot h-2 w-2 rounded-full bg-green-600"
            style={{ animationDelay: `${i * 0.15}s`, animationDuration: "1.2s", ["--mf-dot-lift" as string]: "-5px" }}
          />
        ))}
      </span>
      <span key={label} className="mf-rise">
        {label}
      </span>
    </span>
  );
}

/** زر «أرسل سؤالك لمختص»: يعمل فعلاً في S8، والآن يعرض رسالة لطيفة. */
function ExpertButton() {
  const t = useTranslations("chat");
  const [shown, setShown] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setShown(true)}
        aria-expanded={shown}
        className="inline-flex items-center gap-2 rounded-full bg-gold-500 px-4 py-2 text-sm font-semibold text-green-900 transition hover:brightness-105 active:scale-95"
      >
        {t("askExpert")}
        <span aria-hidden className="rtl:-scale-x-100">
          →
        </span>
      </button>
      {shown && (
        <p role="status" className="mf-rise mt-3 rounded-2xl bg-ivory-50 p-3 text-sm leading-relaxed text-green-900 ring-1 ring-sand-200">
          {t("expertSoon")}
        </p>
      )}
    </div>
  );
}

type Props = { msg: BotMessage; onTerm: (term: GlossaryTerm) => void; onRetry: (id: string) => void };

/** رد مُستفتي حسب نوعه: شرح بمصادر، أو امتناع، أو إحالة، أو توجيه عاجل، أو اعتذار. */
export function BotReply({ msg, onTerm, onRetry }: Props) {
  const t = useTranslations("chat");
  const live = msg.status === "streaming";
  const caret = live ? <span aria-hidden className="mf-caret ms-0.5 inline-block h-4 w-0.5 translate-y-0.5 bg-green-600" /> : null;

  if (msg.status === "pending") {
    return (
      <div className="rounded-[22px] rounded-se-md border border-sand-200 bg-white px-4 py-3">
        <Working stage={msg.stage} />
      </div>
    );
  }

  if (msg.status === "error") {
    return (
      <div className="rounded-[22px] rounded-se-md border border-sand-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-green-900">
        {msg.text && (
          <p dir={msg.dir ?? "auto"} className="mb-2 whitespace-pre-wrap">
            {msg.text}
          </p>
        )}
        <p dir={msg.error?.text ? "auto" : undefined}>{msg.error?.text ?? t(`errors.${msg.error?.key ?? "busy"}`)}</p>
        {msg.error?.key !== "rateLimited" && (
          <button
            type="button"
            onClick={() => onRetry(msg.id)}
            className="mt-3 rounded-full border border-green-600 px-4 py-1.5 text-sm font-semibold text-green-600 transition hover:bg-green-600 hover:text-ivory-50"
          >
            {t("retry")}
          </button>
        )}
      </div>
    );
  }

  if (msg.kind === "urgent") {
    return (
      <div dir={msg.dir} role="alert" className="rounded-[22px] rounded-se-md bg-alert-600 px-5 py-4 text-ivory-50 shadow-[0_18px_50px_-24px_rgb(168_67_42/0.8)]">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-ivory-50 text-alert-600">
            !
          </span>
          {t("urgentTitle")}
        </p>
        <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed sm:text-base">
          {msg.text}
          {caret}
        </p>
      </div>
    );
  }

  const answer = msg.kind === "answer";
  const withExpert = msg.kind === "abstain" || msg.kind === "referral" || msg.kind === "refused";
  const cards = msg.sources.map((s) => s.n);

  return (
    <div className="flex w-full flex-col gap-3">
      <div
        dir={msg.dir}
        className="rounded-[22px] rounded-se-md border border-sand-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-green-900 sm:text-base"
      >
        {answer && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-green-900 px-2.5 py-0.5 text-[11px] font-semibold text-ivory-50">{t("badgeOwn")}</span>
            {msg.level === "C" && (
              <span className="rounded-full bg-gold-500 px-2.5 py-0.5 text-[11px] font-semibold text-green-900">{t("badgeKhilaf")}</span>
            )}
          </div>
        )}
        <p className="whitespace-pre-wrap">
          {answer ? <RichText text={msg.text} messageId={msg.id} cards={cards} onTerm={onTerm} /> : msg.text}
          {caret}
        </p>
        {withExpert && msg.status === "done" && <ExpertButton />}
      </div>

      {answer && msg.status === "done" && msg.sources.length > 0 && (
        <section aria-label={t("sourcesTitle")} className="mf-rise">
          <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-green-600">{t("sourcesTitle")}</h3>
          <ol className="grid gap-2.5">
            {msg.sources.map((s) => (
              <SourceCard key={s.n} source={s} messageId={msg.id} />
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
