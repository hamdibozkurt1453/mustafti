"use client";

import { useTranslations } from "next-intl";
import type { GlossaryTerm } from "@/lib/brain/glossary";
import { CaseReview, ClarifyBubble, StartCaseButton, type CaseApi } from "./CaseFlow";
import { FatwaList } from "./FatwaCard";
import { RichText } from "./RichText";
import { SourceCard } from "./SourceCard";
import type { BotMessage } from "./useChat";

/** مؤشر العمل: النقاط الثلاث مع المرحلة («يبحث في المصادر…»، «أرتّب ملف مسألتك…»). */
function Working({ stage, caseStage }: { stage?: BotMessage["stage"]; caseStage?: BotMessage["caseStage"] }) {
  const t = useTranslations();
  const label = caseStage
    ? t(`case.${caseStage === "planning" ? "preparing" : caseStage}`)
    : t(`chat.stage.${stage ?? "understanding"}`);
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

type Props = {
  msg: BotMessage;
  onTerm: (term: GlossaryTerm) => void;
  onRetry: (id: string) => void;
  caseApi: CaseApi;
  /** سؤال مقترح (عند الامتناع) يُرسل سؤالاً جديداً. */
  onAsk?: (question: string) => void;
};

const CASE_KINDS = new Set(["clarify", "caseFile", "caseNote"]);

/**
 * رد مُستفتي حسب نوعه: شرح بمصادر، أو امتناع، أو إحالة (مع «ابدأ» للاستيضاح)، أو توجيه عاجل،
 * أو اعتذار، أو رسائل الاستيضاح وملف المسألة (CaseFlow.tsx).
 */
export function BotReply({ msg, onTerm, onRetry, caseApi, onAsk }: Props) {
  const t = useTranslations("chat");
  const tc = useTranslations("case");
  const isCase = CASE_KINDS.has(msg.kind ?? "");
  const live = msg.status === "streaming";
  const caret = live ? <span aria-hidden className="mf-caret ms-0.5 inline-block h-4 w-0.5 translate-y-0.5 bg-green-600" /> : null;

  if (msg.status === "pending") {
    return (
      <div className="rounded-[22px] rounded-se-md border border-sand-200 bg-white px-4 py-3">
        <Working stage={msg.stage} caseStage={msg.caseStage} />
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
            onClick={() => (isCase ? caseApi.retry() : onRetry(msg.id))}
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

  if (msg.kind === "clarify" && msg.clarify) return <ClarifyBubble msg={msg} api={caseApi} />;
  if (msg.kind === "caseFile" && msg.caseFile) return <CaseReview msg={msg} api={caseApi} />;
  if (msg.kind === "caseNote") {
    return (
      <div className="rounded-[22px] rounded-se-md border border-sand-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-green-900">
        {tc("cancelled")}
      </div>
    );
  }

  const answer = msg.kind === "answer";
  // «ابدأ» بعد الإحالة، و«أرسل سؤالك لمختص» بعد الامتناع: يبدأ الاستيضاح في المحادثة نفسها.
  const flow = caseApi.flow;
  const started = flow && flow.sourceId === msg.id && flow.step !== "cancelled";
  const withExpert = (msg.kind === "abstain" || msg.kind === "referral" || msg.kind === "refused") && !started;
  // الحالة الشخصية مع فتاوى منشورة: البطاقات أولاً، ثم «الأفضل لحالتك أن يراها مختص» والزر.
  const caseFatwas = msg.kind === "referral" && Boolean(msg.fatwas?.length);
  const abstained = msg.kind === "abstain" || msg.kind === "refused";
  const cards = msg.sources.map((s) => s.n);
  const done = msg.status === "done";

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
        {withExpert && done && !caseFatwas && (
          <StartCaseButton label={msg.kind === "referral" ? tc("start") : t("askExpert")} onStart={() => caseApi.start(msg.id)} />
        )}
      </div>

      {(answer || abstained) && done && msg.sources.length > 0 && (
        <section aria-label={t(answer ? "sourcesTitle" : "relatedTitle")} className="mf-rise">
          <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-green-600">
            {t(answer ? "sourcesTitle" : "relatedTitle")}
          </h3>
          <ol className="grid gap-2.5">
            {msg.sources.map((s) => (
              <SourceCard key={s.n} source={s} messageId={msg.id} />
            ))}
          </ol>
        </section>
      )}

      {done && msg.fatwas && msg.fatwas.length > 0 && <FatwaList fatwas={msg.fatwas} title={t("fatwasTitle")} />}

      {caseFatwas && done && (
        <div dir={msg.dir} className="rounded-[22px] border border-sand-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-green-900">
          {msg.note && <p>{msg.note}</p>}
          {!started && <StartCaseButton label={t("sendCase")} onStart={() => caseApi.start(msg.id)} />}
        </div>
      )}

      {abstained && done && msg.suggestions && msg.suggestions.length > 0 && (
        <section aria-label={t("suggestTitle")} className="mf-rise">
          <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-green-600">{t("suggestTitle")}</h3>
          <ul className="flex flex-wrap gap-2" dir={msg.dir}>
            {msg.suggestions.map((q) => (
              <li key={q}>
                <button
                  type="button"
                  onClick={() => onAsk?.(q)}
                  disabled={!onAsk}
                  className="rounded-full border border-green-600/40 bg-white px-3.5 py-1.5 text-start text-sm font-semibold text-green-900 transition hover:border-green-600 hover:bg-green-600 hover:text-ivory-50 active:scale-95"
                >
                  {q}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
