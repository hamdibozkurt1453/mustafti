"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { Dhikr } from "@/lib/adhkar/store";
import { OCCASIONS, type Occasion } from "@/lib/adhkar/rules";

const KEY = "mustafti:adhkar";

/** العدّاد في المتصفح فقط، ويبدأ من جديد كل يوم (الأذكار يومية). */
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

/** التبويب الافتراضي حسب الساعة: الصباح قبل العصر تقريباً، والمساء بعده. */
function defaultTab(): Occasion {
  const h = new Date().getHours();
  return h >= 4 && h < 15 ? "morning" : "evening";
}

export function AdhkarView({ items, rtlMeaning }: { items: Dhikr[]; rtlMeaning: boolean }) {
  const t = useTranslations("adhkar");
  const [tab, setTab] = useState<Occasion>("morning");
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const id = setTimeout(() => {
      setCounts(load());
      setTab(defaultTab());
    }, 0);
    return () => clearTimeout(id);
  }, []);

  function bump(key: string, target: number | null) {
    setCounts((prev) => {
      const n = (prev[key] ?? 0) + 1;
      const next = { ...prev, [key]: target ? Math.min(n, target) : n };
      store(next);
      return next;
    });
    navigator.vibrate?.(10);
  }

  function reset(keys: string[]) {
    setCounts((prev) => {
      const next = { ...prev };
      for (const k of keys) delete next[k];
      store(next);
      return next;
    });
  }

  const list = items.filter((d) => d.occasions.includes(tab));
  const keys = list.map((d) => `${tab}:${d.id}`);

  return (
    <div className="mt-8">
      <div role="tablist" aria-label={t("tabsLabel")} className="flex flex-wrap gap-2 border-b border-sand-200 pb-3">
        {OCCASIONS.map((o) => (
          <button
            key={o}
            role="tab"
            type="button"
            aria-selected={tab === o}
            onClick={() => setTab(o)}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
              tab === o ? "bg-green-900 text-ivory-50" : "text-green-900 hover:bg-green-900/5"
            }`}
          >
            {t(`tabs.${o}`)}
          </button>
        ))}
        {list.length > 0 && (
          <button type="button" onClick={() => reset(keys)} className="ms-auto text-sm text-ink-600 underline underline-offset-4">
            {t("reset")}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-sand-200 bg-white p-6 text-center text-ink-600">{t("empty")}</p>
      ) : list.length === 0 ? (
        <p className="mt-8 text-center text-ink-600">{t("emptyTab")}</p>
      ) : (
        <ol role="tabpanel" className="mt-6 grid gap-4">
          {list.map((d) => {
            const key = `${tab}:${d.id}`;
            const n = counts[key] ?? 0;
            const done = d.count !== null && n >= d.count;
            return (
              <li
                key={key}
                className={`rounded-[24px] border p-5 transition sm:p-6 ${done ? "border-green-600/40 bg-green-600/5" : "border-sand-200 bg-white"}`}
              >
                <p lang="ar" dir="rtl" className="whitespace-pre-line font-display text-[19px] leading-[2.1] text-green-900 sm:text-[21px]">
                  {d.text}
                </p>

                {d.meaning && (
                  <div className="mt-4 border-t border-sand-200 pt-4">
                    <p className="text-xs font-semibold text-green-600">{t("meaning")}</p>
                    <p dir={rtlMeaning ? "rtl" : "ltr"} className="mt-1 whitespace-pre-line leading-relaxed text-ink-600">{d.meaning}</p>
                  </div>
                )}
                {d.explanation && (
                  <details className="mt-3 text-sm text-ink-600">
                    <summary className="cursor-pointer font-semibold text-green-600">{t("explanation")}</summary>
                    <p dir={d.meaning ? (rtlMeaning ? "rtl" : "ltr") : "rtl"} className="mt-2 whitespace-pre-line leading-relaxed">{d.explanation}</p>
                  </details>
                )}

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => bump(key, d.count)}
                    disabled={done}
                    aria-label={t("counterLabel", { n, total: d.count ?? "∞" })}
                    className={`inline-flex min-w-28 items-center justify-center gap-2 rounded-full px-5 py-2.5 font-semibold tabular-nums transition ${
                      done ? "bg-green-600 text-ivory-50" : "bg-gold-500 text-green-900 hover:brightness-105 active:scale-95"
                    }`}
                  >
                    {done ? "✓ " : ""}
                    <bdi dir="ltr">{d.count ? `${n} / ${d.count}` : n}</bdi>
                  </button>
                  <p className="text-xs text-ink-600">
                    {d.count ? t("times", { count: d.count }) : t("noCount")}
                  </p>
                </div>

                <p className="mt-4 flex flex-wrap gap-x-3 gap-y-1 border-t border-sand-200 pt-3 text-xs text-ink-600">
                  <span>
                    {t("source")}: <span className="font-semibold text-green-900">{t("sourceName")}</span>
                  </span>
                  <span>
                    {t("grade")}: <bdi className="font-semibold text-green-900">{d.meaningGrade ?? d.grade}</bdi>
                  </span>
                  <a href={d.meaningUrl ?? d.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-green-600 underline underline-offset-4">
                    {t("viewSource")}
                  </a>
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
