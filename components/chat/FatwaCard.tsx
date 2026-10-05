"use client";

import { useTranslations } from "next-intl";
import { dirForText, type ChatFatwa } from "@/lib/chat/protocol";

/**
 * بطاقة فتوى منشورة: شارة «نص منقول»، والعنوان، والمقتطف الحرفي من الجواب (≤ 400 حرف)،
 * والمفتي أو الجهة، ورابط الفتوى في موقعها الأصلي. لا تلخيص ولا تطبيق على حالة السائل.
 */
export function FatwaCard({ fatwa }: { fatwa: ChatFatwa }) {
  const t = useTranslations("chat");
  return (
    <li className="rounded-[20px] border border-sand-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-gold-50 px-2.5 py-0.5 text-[11px] font-semibold text-green-900 ring-1 ring-gold-500/50">
          {t("badgeQuoted")}
        </span>
        <span className="rounded-full bg-green-600/10 px-2.5 py-0.5 text-[11px] font-semibold text-green-600">{t("fatwaBadge")}</span>
      </div>
      <p dir="auto" className="mt-2 text-sm font-semibold leading-snug">
        {fatwa.title}
      </p>
      <blockquote
        dir={dirForText(fatwa.excerpt)}
        className="mt-2 whitespace-pre-wrap border-s-2 border-gold-500 ps-3 text-[14px] leading-relaxed text-green-900/90"
      >
        {fatwa.excerpt}
      </blockquote>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-sand-200 pt-3 text-xs">
        <span className="text-ink-600">
          {t("fatwaBy")}: <bdi dir="auto">{fatwa.mufti}</bdi>
        </span>
        <a
          href={fatwa.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-full bg-green-900 px-3 py-1.5 font-semibold text-ivory-50 transition hover:bg-green-600"
        >
          {t("viewFatwa")}
          <span aria-hidden>↗</span>
        </a>
      </div>
    </li>
  );
}

/** قسم «فتاوى منشورة ذات صلة». */
export function FatwaList({ fatwas, title }: { fatwas: ChatFatwa[]; title: string }) {
  return (
    <section aria-label={title} className="mf-rise">
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-green-600">{title}</h3>
      <ol className="grid gap-2.5">
        {fatwas.map((f) => (
          <FatwaCard key={f.url} fatwa={f} />
        ))}
      </ol>
    </section>
  );
}
