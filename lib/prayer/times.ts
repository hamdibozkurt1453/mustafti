import { CalculationMethod, Coordinates, HighLatitudeRule, Madhab, PrayerTimes } from "adhan";
import { cityById, DEFAULT_CITY_ID } from "./cities";

/**
 * حساب المواقيت في المتصفح فقط (مكتبة adhan). لا يُرسل الموقع إلى الخادم أبداً:
 * الإحداثيات من إذن المتصفح تبقى في هذه الصفحة، والذي يُحفظ في الحساب هو معرّف المدينة
 * المختارة من القائمة المضمّنة وطريقة الحساب فقط.
 */

export const METHODS = ["UmmAlQura", "MuslimWorldLeague", "Egyptian", "Turkey", "Karachi", "NorthAmerica"] as const;
export type MethodKey = (typeof METHODS)[number];
export type AsrMadhab = "shafi" | "hanafi";

export const PRAYERS = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"] as const;
export type PrayerKey = (typeof PRAYERS)[number];
/** الصلوات الخمس (بلا الشروق) للعدّ التنازلي. */
export const FIVE: PrayerKey[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

/** الموقع: مدينة من القائمة، أو موقع المتصفح (يبقى في المتصفح فقط). */
export type Place =
  | { kind: "city"; cityId: string }
  | { kind: "geo"; lat: number; lng: number };

export type PrayerSettings = { place: Place; method: MethodKey; madhab: AsrMadhab };

export const DEFAULT_SETTINGS: PrayerSettings = {
  place: { kind: "city", cityId: DEFAULT_CITY_ID },
  method: "UmmAlQura",
  madhab: "shafi",
};

export const STORAGE_KEY = "mustafti:prayer";

export function isMethod(v: unknown): v is MethodKey {
  return typeof v === "string" && (METHODS as readonly string[]).includes(v);
}

/** إحداثيات الموقع ومنطقته الزمنية (undefined = توقيت المتصفح). */
export function resolvePlace(place: Place): { lat: number; lng: number; tz: string | undefined } {
  if (place.kind === "geo") return { lat: place.lat, lng: place.lng, tz: undefined };
  const c = cityById(place.cityId) ?? cityById(DEFAULT_CITY_ID)!;
  return { lat: c.lat, lng: c.lng, tz: c.tz };
}

function params(settings: PrayerSettings, coords: Coordinates) {
  const p = CalculationMethod[settings.method]();
  p.madhab = settings.madhab === "hanafi" ? Madhab.Hanafi : Madhab.Shafi;
  // المدن الشمالية (أوسلو، ستوكهولم…): قاعدة العروض العليا الموصى بها حتى لا يغيب الفجر والعشاء صيفاً.
  p.highLatitudeRule = HighLatitudeRule.recommended(coords);
  return p;
}

/**
 * مواقيت يوم المدينة (لا يوم المتصفح): التاريخ يُقرأ بالمنطقة الزمنية للمدينة،
 * ثم يُمرَّر إلى adhan يوماً تقويمياً.
 */
export function dayTimes(settings: PrayerSettings, now: Date, offsetDays = 0): Record<PrayerKey, Date> {
  const { lat, lng, tz } = resolvePlace(settings.place);
  const coords = new Coordinates(lat, lng);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now)
    .reduce<Record<string, number>>((acc, x) => (x.type === "literal" ? acc : { ...acc, [x.type]: Number(x.value) }), {});
  const day = new Date(parts.year, parts.month - 1, parts.day + offsetDays);
  const pt = new PrayerTimes(coords, day, params(settings, coords));
  return { fajr: pt.fajr, sunrise: pt.sunrise, dhuhr: pt.dhuhr, asr: pt.asr, maghrib: pt.maghrib, isha: pt.isha };
}

/** الصلاة السابقة والقادمة (من الخمس) حول الآن، عبر الأمس واليوم والغد. */
export function prayerWindow(settings: PrayerSettings, now: Date) {
  const all: { name: PrayerKey; at: Date }[] = [];
  for (const offset of [-1, 0, 1]) {
    const t = dayTimes(settings, now, offset);
    for (const n of FIVE) all.push({ name: n, at: t[n] });
  }
  all.sort((a, b) => a.at.getTime() - b.at.getTime());
  const i = all.findIndex((p) => p.at > now);
  return { prev: all[i - 1], next: all[i] };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** المدة الباقية بصيغة ساعات:دقائق:ثوانٍ. */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/**
 * profiles.calc_method يحفظ الطريقة ومذهب العصر معاً: "UmmAlQura" أو "UmmAlQura:hanafi"
 * (لا عمود مستقل للمذهب في المخطط، فلا migration لهذا).
 */
export function encodeMethod(method: MethodKey, madhab: AsrMadhab): string {
  return madhab === "hanafi" ? `${method}:hanafi` : method;
}

export function decodeMethod(value: string | null | undefined): { method: MethodKey; madhab: AsrMadhab } | null {
  const [m, mad] = (value ?? "").split(":");
  if (!isMethod(m)) return null;
  return { method: m, madhab: mad === "hanafi" ? "hanafi" : "shafi" };
}

/** يقرأ إعدادات محفوظة (JSON من المتصفح) ويتحقق منها؛ وأي قيمة غير صالحة تعود إلى الافتراضي. */
export function parseSettings(raw: unknown): PrayerSettings | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const p = o.place as Record<string, unknown> | undefined;
  let place: Place | null = null;
  if (p?.kind === "city" && typeof p.cityId === "string" && cityById(p.cityId)) place = { kind: "city", cityId: p.cityId };
  else if (
    p?.kind === "geo" &&
    typeof p.lat === "number" && Math.abs(p.lat) <= 90 &&
    typeof p.lng === "number" && Math.abs(p.lng) <= 180
  )
    place = { kind: "geo", lat: p.lat, lng: p.lng };
  if (!place) return null;
  return {
    place,
    method: isMethod(o.method) ? o.method : DEFAULT_SETTINGS.method,
    madhab: o.madhab === "hanafi" ? "hanafi" : "shafi",
  };
}

export function loadSettings(): PrayerSettings | null {
  try {
    return parseSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    return null;
  }
}

export function storeSettings(s: PrayerSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* وضع التصفح الخاص */
  }
}
