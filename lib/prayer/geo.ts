import type { MethodKey } from "./times";

/**
 * F2: الموقع آلياً من ترويسات Vercel الجغرافية (في الخادم، من عنوان IP، بلا إذن من المتصفح ولا تخزين)،
 * وطريقة الحساب من البلد. دوال صرفة للاختبار؛ المسار /api/geo يقرأ الترويسات ويعيد النتيجة.
 */

export type GeoPlace = {
  lat: number;
  lng: number;
  /** اسم المدينة كما في الترويسة (قد يغيب)، أو null. */
  city: string | null;
  /** رمز البلد ISO من حرفين، أو null. */
  country: string | null;
  /** المنطقة الزمنية IANA إن وُجدت. */
  tz: string | null;
  method: MethodKey;
  /** true إن غابت الترويسات فاستُعملت مكة احتياطاً. */
  fallback: boolean;
};

/** الاحتياط: مكة المكرمة بطريقة أم القرى. */
export const MAKKAH: GeoPlace = {
  lat: 21.4225,
  lng: 39.8262,
  city: null,
  country: "SA",
  tz: "Asia/Riyadh",
  method: "UmmAlQura",
  fallback: true,
};

/** أمريكا الشمالية (ISNA): الولايات المتحدة وكندا والمكسيك. */
const NORTH_AMERICA = new Set(["US", "CA", "MX"]);

/** طريقة الحساب من البلد: أم القرى للسعودية، والهيئة المصرية لمصر، وديانت لتركيا، وISNA لأمريكا الشمالية، وMWL للباقي. */
export function methodForCountry(country: string | null | undefined): MethodKey {
  const cc = (country ?? "").trim().toUpperCase();
  if (cc === "SA") return "UmmAlQura";
  if (cc === "EG") return "Egyptian";
  if (cc === "TR") return "Turkey";
  if (NORTH_AMERICA.has(cc)) return "NorthAmerica";
  return "MuslimWorldLeague";
}

type HeaderSource = { get(name: string): string | null };

function decode(v: string | null): string | null {
  if (!v) return null;
  try {
    return decodeURIComponent(v).trim() || null;
  } catch {
    return v.trim() || null;
  }
}

function isTimeZone(tz: string | null): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * الموقع من ترويسات Vercel: x-vercel-ip-latitude وx-vercel-ip-longitude (لازمتان)، وx-vercel-ip-city
 * (مُرمّزة URI) وx-vercel-ip-country وx-vercel-ip-timezone. إن غابت الإحداثيات أو لم تصلح: مكة.
 */
export function placeFromHeaders(h: HeaderSource): GeoPlace {
  const lat = Number.parseFloat(h.get("x-vercel-ip-latitude") ?? "");
  const lng = Number.parseFloat(h.get("x-vercel-ip-longitude") ?? "");
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return MAKKAH;
  const country = (h.get("x-vercel-ip-country") ?? "").trim().toUpperCase();
  const tz = decode(h.get("x-vercel-ip-timezone"));
  return {
    lat,
    lng,
    city: decode(h.get("x-vercel-ip-city"))?.slice(0, 80) ?? null,
    country: /^[A-Z]{2}$/.test(country) ? country : null,
    tz: isTimeZone(tz) ? tz : null,
    method: methodForCountry(country),
    fallback: false,
  };
}
