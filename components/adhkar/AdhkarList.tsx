"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { Dhikr } from "@/lib/adhkar/store";
import type { Occasion } from "@/lib/adhkar/rules";

const KEY = "mustafti:adhkar:page";
type Saved = { day: string; counts: Record<string, number> };
const today = () => new Date().toLocaleDateString("en-CA");

function load(): Record<string, number> {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    return s && s.day === today() && s.counts && typeof s.counts === "object" ? s.counts : {};
  } catch {
    return {};
  }
}

function store(counts: Record<string, number>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ day: today(), counts } satisfies Saved));
  } catch {
    /* وضع التصفح الخاص */
  }
}

/**
 * F2: أذكار فئة واحدة في صفحة /adhkar: كل ذكر ببطاقته (النص العربي، والنطق، والمعنى، والتخريج،
 * والعدد بعدّاد يبدأ من جديد كل يوم في هذا المتصفح).
 */
export function AdhkarList({ items, occasion, showTransliteration }: { items: Dhikr[]; occasion: Occasion; showTransliteration: boolean }) {
  const t = useTranslations("adhkar");
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- القراءة بعد التحميل فقط
    setCounts(load());
  }, []);

  function bump(d: Dhikr) {
    const key = `${occasion}:${d.id}`;
    setCounts((prev) => {
      const n = prev[key] ?? 0;
      if (d.count !== null && n >= d.count) return prev;
      const all = { ...prev, [key]: n + 1 };
      store(all);
      return all;
    });
    navigator.vibrate?.(10);
  }

  if (!items.length) return <p className="mt-8 rounded-2xl border border-dashed border-sand-200 bg-white p-6 text-center text-ink-600">{t("emptyTab")}</p>;

  return (
    <ol className="mf-stagger mt-6 space-y-4">
      {items.map((d, i) => {
        const n = counts[`${occasion}:${d.id}`] ?? 0;
        const done = d.count !== null && n >= d.count;
        return (
          <li key={d.id} className={`rounded-[24px] border bg-white p-5 transition-colors sm:p-7 ${done ? "border-green-600/40" : "border-sand-200"}`}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-semibold text-green-600">
                <bdi dir="ltr">{i + 1}</bdi> · <bdi>{d.title ?? t("title")}</bdi>
              </p>
              <p className="flex-none text-xs text-ink-600">{d.count ? t("times", { count: d.count }) : t("noCount")}</p>
            </div>
            <p lang="ar" dir="rtl" className="mt-3 whitespace-pre-line font-display text-[19px] leading-[2.1] text-green-900 sm:text-[21px]">
              {d.text}
            </p>
            {showTransliteration && d.transliteration && (
              <p dir="ltr" className="mt-3 whitespace-pre-line text-sm italic leading-relaxed text-ink-600">{d.transliteration}</p>
            )}
            {d.meaning && (
              <details className="mt-3 border-t border-sand-200 pt-3 text-sm text-ink-600">
                <summary className="cursor-pointer font-semibold text-green-600">{t("meaning")}</summary>
                <p dir="auto" className="mt-2 whitespace-pre-line leading-relaxed">{d.meaning}</p>
              </details>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-sand-200 pt-3">
              <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-600">
                {t("source")}: <bdi className="font-semibold text-green-900">{d.reference ?? t("sourceName")}</bdi>
                {" · "}
                <a href={d.meaningUrl ?? d.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-green-600 underline underline-offset-4">
                  {t("viewSource")}
                </a>
              </p>
              <button
                type="button"
                onClick={() => bump(d)}
                disabled={done}
                aria-label={t("counterLabel", { n, total: d.count ?? "∞" })}
                className={`mf-press inline-flex min-w-24 items-center justify-center gap-1 rounded-full px-5 py-2 font-semibold tabular-nums ${
                  done ? "bg-green-600 text-ivory-50" : "bg-gold-500 text-green-900 hover:brightness-105"
                }`}
              >
                {done ? "✓ " : ""}
                <bdi dir="ltr">{d.count ? `${n} / ${d.count}` : n}</bdi>
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
