"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import type { Dhikr } from "@/lib/adhkar/group";
import type { DhikrMoment } from "@/lib/adhkar/moment";

const KEY = "mustafti:adhkar:timed";
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
 * F2b: الأذكار داخل بطاقة المواقيت كإشعار موقوت (شريط ذهبي رقيق تحت المواقيت): فئة الوقت الآن
 * (dhikrMoment)، والذكر الأول منها بعدّاد التكرار وزر «التالي»، ورابط «كل الأذكار». تتبدّل الفئة مع الوقت
 * تلقائياً ويعود العرض إلى أول ذكر فيها. العدّاد في هذا المتصفح، ويبدأ من جديد كل يوم.
 */
export function TimedDhikr({ moment, adhkar }: { moment: DhikrMoment | null; adhkar: Dhikr[] }) {
  const t = useTranslations("adhkar");
  const occasion = moment?.occasion ?? null;
  const list = occasion ? adhkar.filter((d) => d.occasions.includes(occasion)) : [];
  const [state, setState] = useState<{ occasion: string | null; index: number }>({ occasion: null, index: 0 });
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- القراءة بعد التحميل فقط
    setCounts(load());
  }, []);

  // تبدّل الفئة مع الوقت: من أول ذكر.
  const index = state.occasion === occasion ? Math.min(state.index, Math.max(0, list.length - 1)) : 0;
  const d = list[index];
  if (!occasion || !d) return null;

  const key = `${occasion}:${d.id}`;
  const n = counts[key] ?? 0;
  const done = d.count !== null && n >= d.count;

  function next() {
    setState({ occasion, index: (index + 1) % list.length });
  }

  function bump() {
    if (!d || done) return;
    const value = n + 1;
    setCounts((prev) => {
      const all = { ...prev, [key]: value };
      store(all);
      return all;
    });
    navigator.vibrate?.(10);
    if (d.count !== null && value >= d.count && list.length > 1) setTimeout(next, 600);
  }

  return (
    <div data-testid="timed-dhikr" className="mt-8 border-t border-gold-500/40 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold-500">
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-gold-500 motion-safe:animate-pulse" />
          <span aria-live="polite">{t(`moments.${occasion}`)}</span>
          <span className="font-normal normal-case tracking-normal text-ivory-50/50">
            <bdi dir="ltr">
              {index + 1} / {list.length}
            </bdi>
          </span>
        </p>
        <Link href={{ pathname: "/adhkar", query: { c: occasion } }} className="text-xs font-semibold text-ivory-50/80 underline-offset-4 hover:text-gold-500 hover:underline">
          {t("all")}
        </Link>
      </div>

      <div key={key} className="mf-fade mt-3">
        <p lang="ar" dir="rtl" className="max-h-40 overflow-y-auto whitespace-pre-line font-display text-[17px] leading-[2] text-ivory-50 sm:text-[19px]">
          {d.text}
        </p>
        {d.reference && <p className="mt-1 text-[11px] leading-relaxed text-ivory-50/50">{d.reference}</p>}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={bump}
          disabled={done}
          aria-label={t("counterLabel", { n, total: d.count ?? "∞" })}
          className={`mf-press inline-flex min-w-24 items-center justify-center gap-1 rounded-full px-5 py-2 text-sm font-semibold tabular-nums ${
            done ? "bg-green-600 text-ivory-50" : "bg-gold-500 text-green-900 hover:brightness-105"
          }`}
        >
          {done ? "✓ " : ""}
          <bdi dir="ltr">{d.count ? `${n} / ${d.count}` : n}</bdi>
        </button>
        {list.length > 1 && (
          <button
            type="button"
            onClick={next}
            className="mf-press rounded-full border border-ivory-50/25 px-5 py-2 text-sm font-semibold text-ivory-50 hover:border-gold-500 hover:text-gold-500"
          >
            {t("next")}
          </button>
        )}
      </div>
    </div>
  );
}
