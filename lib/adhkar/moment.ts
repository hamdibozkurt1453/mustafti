import type { Occasion } from "./rules";

/**
 * F2: «ذِكر الآن» — الذكر المناسب للوقت من مواقيت اليوم (دالة صرفة للاختبار):
 *   قبل الصلاة بدقيقتين حتى 5 دقائق بعد دخول وقتها: «أذكار قبل الصلاة» (الأذان والإقامة والاستفتاح)؛
 *   ثم بعد 5 دقائق من دخول الوقت ولمدة نصف ساعة: «أذكار بعد الصلاة»؛
 *   وخارج ذلك: بعد الفجر حتى الظهر «أذكار الصباح»، وبعد العصر حتى العشاء «أذكار المساء»،
 *   وبعد العشاء «أذكار النوم»، وفي الساعة والنصف قبل الفجر «أذكار الاستيقاظ».
 *   بين الظهر والعصر (خارج نافذتي الصلاة): أذكار بعد الصلاة.
 */

export type DayTimes = { fajr: Date; dhuhr: Date; asr: Date; maghrib: Date; isha: Date };

const MIN = 60_000;
export const BEFORE_PRAYER_MS = 2 * MIN;
export const AFTER_PRAYER_START_MS = 5 * MIN;
export const AFTER_PRAYER_WINDOW_MS = 30 * MIN;
export const WAKING_BEFORE_FAJR_MS = 90 * MIN;

export type DhikrMoment = { occasion: Occasion; prayer?: keyof DayTimes };

const FIVE: (keyof DayTimes)[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

export function dhikrMoment(now: Date, times: DayTimes): DhikrMoment {
  const t = now.getTime();
  // صلوات اليوم، وفجر الغد تقريباً (بعد 24 ساعة) لما بعد العشاء.
  const prayers = [...FIVE.map((name) => ({ name, at: times[name].getTime() })), { name: "fajr" as const, at: times.fajr.getTime() + 24 * 60 * MIN }];

  for (const p of prayers) {
    if (t >= p.at - BEFORE_PRAYER_MS && t < p.at + AFTER_PRAYER_START_MS) return { occasion: "before_prayer", prayer: p.name };
  }
  for (const p of prayers) {
    if (t >= p.at + AFTER_PRAYER_START_MS && t < p.at + AFTER_PRAYER_START_MS + AFTER_PRAYER_WINDOW_MS) return { occasion: "after_prayer", prayer: p.name };
  }

  const fajr = times.fajr.getTime();
  const nextFajr = fajr + 24 * 60 * MIN;
  if (t < fajr) return { occasion: t >= fajr - WAKING_BEFORE_FAJR_MS ? "waking" : "sleep" };
  if (t < times.dhuhr.getTime()) return { occasion: "morning" };
  if (t < times.asr.getTime()) return { occasion: "after_prayer" };
  if (t < times.isha.getTime()) return { occasion: "evening" };
  return { occasion: t >= nextFajr - WAKING_BEFORE_FAJR_MS ? "waking" : "sleep" };
}
