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

/**
 * بطاقة الأذكار في الرئيسية (R2، بدل صفحة /adhkar): تبويبات الصباح والمساء وبعد الصلاة من جدول adhkar،
 * ذكر واحد في كل مرة بعدّاده، وينتقل إلى التالي عند اكتمال العدد. النص منقول بحروفه من موسوعة الأحاديث،
 * أو من بذرة الأذكار المشهورة بتخريجها (F2: الكتاب ورقم الحديث بدل اسم الموسوعة).
 * إن كان الجدول فارغاً تُخفى البطاقة كلها بلا رسالة خطأ.
 */
export function AdhkarCard({ items, rtlMeaning }: { items: Dhikr[]; rtlMeaning: boolean }) {
  const t = useTranslations("adhkar");
  const [tab, setTab] = useState<Occasion>("morning");
  const [index, setIndex] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const id = setTimeout(() => {
      setCounts(load());
      setTab(defaultTab());
    }, 0);
    return () => clearTimeout(id);
  }, []);

  if (!items.length) return null;

  const tabs = OCCASIONS.filter((o) => items.some((d) => d.occasions.includes(o)));
  const list = items.filter((d) => d.occasions.includes(tab));
  const i = Math.min(index, Math.max(0, list.length - 1));
  const d = list[i];
  const key = d ? `${tab}:${d.id}` : "";
  const n = counts[key] ?? 0;
  const done = Boolean(d && d.count !== null && n >= d.count);
  const finished = list.filter((x) => x.count !== null && (counts[`${tab}:${x.id}`] ?? 0) >= x.count).length;

  function choose(o: Occasion) {
    setTab(o);
    setIndex(0);
  }

  function bump() {
    if (!d || done) return;
    const next = Math.min(n + 1, d.count ?? Infinity);
    setCounts((prev) => {
      const all = { ...prev, [key]: next };
      store(all);
      return all;
    });
    navigator.vibrate?.(10);
    // اكتمل العدد: إلى الذكر التالي بعد لحظة.
    if (d.count !== null && next >= d.count && i < list.length - 1) setTimeout(() => setIndex(i + 1), 450);
  }

  function reset() {
    setCounts((prev) => {
      const all = { ...prev };
      for (const x of list) delete all[`${tab}:${x.id}`];
      store(all);
      return all;
    });
    setIndex(0);
  }

  return (
    <section id="adhkar" aria-labelledby="adhkar-title" className="scroll-mt-24">
      <div className="mf-lift overflow-hidden rounded-[32px] border border-sand-200 bg-white p-6 sm:p-9">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="adhkar-title" className="font-display text-2xl font-semibold text-green-900 sm:text-3xl">{t("title")}</h2>
          <div role="tablist" aria-label={t("tabsLabel")} className="flex flex-wrap gap-1 rounded-full bg-ivory-50 p-1">
            {tabs.map((o) => (
              <button
                key={o}
                role="tab"
                type="button"
                aria-selected={tab === o}
                onClick={() => choose(o)}
                className={`mf-press rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                  tab === o ? "bg-green-900 text-ivory-50" : "text-green-900 hover:bg-green-900/5"
                }`}
              >
                {t(`tabs.${o}`)}
              </button>
            ))}
          </div>
        </div>

        {!d ? (
          <p className="mt-8 text-center text-ink-600">{t("emptyTab")}</p>
        ) : (
          <div role="tabpanel" className="mt-6">
            {/* التقدم في التبويب */}
            <div className="flex items-center gap-3 text-xs text-ink-600">
              <span className="tabular-nums">
                <bdi dir="ltr">{i + 1} / {list.length}</bdi>
              </span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-sand-200" aria-hidden>
                <div
                  className="h-full rounded-full bg-gold-500 motion-safe:transition-[width] motion-safe:duration-500"
                  style={{ width: `${(finished / list.length) * 100}%` }}
                />
              </div>
              <button type="button" onClick={reset} className="underline underline-offset-4 hover:text-green-900">
                {t("reset")}
              </button>
            </div>

            <div key={key} className="mf-fade mt-5">
              <p
                lang="ar"
                dir="rtl"
                className="max-h-72 overflow-y-auto whitespace-pre-line font-display text-[19px] leading-[2.1] text-green-900 sm:text-[21px]"
              >
                {d.text}
              </p>
              {d.meaning && (
                <details className="mt-4 border-t border-sand-200 pt-3 text-sm text-ink-600">
                  <summary className="cursor-pointer font-semibold text-green-600">{t("meaning")}</summary>
                  <p dir={rtlMeaning ? "rtl" : "ltr"} className="mt-2 max-h-48 overflow-y-auto whitespace-pre-line leading-relaxed">
                    {d.meaning}
                  </p>
                </details>
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIndex(Math.max(0, i - 1))}
                  disabled={i === 0}
                  aria-label={t("prev")}
                  className="mf-press flex h-10 w-10 items-center justify-center rounded-full border border-sand-200 text-green-900 hover:border-green-600 disabled:opacity-40"
                >
                  <span aria-hidden className="rtl:-scale-x-100">←</span>
                </button>
                <button
                  type="button"
                  onClick={bump}
                  disabled={done}
                  aria-label={t("counterLabel", { n, total: d.count ?? "∞" })}
                  className={`mf-press inline-flex min-w-32 items-center justify-center gap-2 rounded-full px-6 py-3 text-lg font-semibold tabular-nums ${
                    done ? "bg-green-600 text-ivory-50" : "bg-gold-500 text-green-900 hover:brightness-105"
                  }`}
                >
                  {done ? "✓ " : ""}
                  <bdi dir="ltr">{d.count ? `${n} / ${d.count}` : n}</bdi>
                </button>
                <button
                  type="button"
                  onClick={() => setIndex(Math.min(list.length - 1, i + 1))}
                  disabled={i >= list.length - 1}
                  aria-label={t("next")}
                  className="mf-press flex h-10 w-10 items-center justify-center rounded-full border border-sand-200 text-green-900 hover:border-green-600 disabled:opacity-40"
                >
                  <span aria-hidden className="rtl:-scale-x-100">→</span>
                </button>
              </div>
              <p className="text-xs text-ink-600">{d.count ? t("times", { count: d.count }) : t("noCount")}</p>
            </div>

            <p className="mt-5 flex flex-wrap gap-x-3 gap-y-1 border-t border-sand-200 pt-3 text-xs text-ink-600">
              <span>
                {t("source")}: <bdi className="font-semibold text-green-900">{d.reference ?? t("sourceName")}</bdi>
              </span>
              <span>
                {t("grade")}: <bdi className="font-semibold text-green-900">{d.meaningGrade ?? d.grade}</bdi>
              </span>
              <a href={d.meaningUrl ?? d.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-green-600 underline underline-offset-4">
                {t("viewSource")}
              </a>
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
