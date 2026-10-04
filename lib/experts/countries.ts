/**
 * البلدان: رموز ISO 3166-1 alpha-2 (كما في ترويسة x-vercel-ip-country)، والاسم بلغة الواجهة من Intl.
 * الملف نقي (يُختبر محلياً). القائمة تُبنى في الخادم وتُمرَّر إلى المتصفح، فلا يختلف النص بين الخادم والمتصفح.
 */

export const COUNTRY_CODES = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BW", "BY", "BZ",
  "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ",
  "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR",
  "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GT", "GU", "GW", "GY",
  "HK", "HN", "HR", "HT", "HU", "ID", "IE", "IM", "IN", "IQ", "IR", "IS", "IT", "JE", "JM", "JO", "JP",
  "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY",
  "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ",
  "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM",
  "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ",
  "TC", "TD", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ",
  "UA", "UG", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI", "VN", "VU", "WF", "WS", "XK", "YE", "YT", "ZA", "ZM", "ZW",
] as const;

const CODES = new Set<string>(COUNTRY_CODES);

/** رمز بلد صالح من القائمة (بأحرف كبيرة)، أو null. */
export function countryCodeOf(value: string | null | undefined): string | null {
  const code = (value ?? "").trim().toUpperCase();
  return CODES.has(code) ? code : null;
}

/** اسم البلد بلغة الواجهة، أو null إن لم يكن الرمز صالحاً. */
export function countryName(code: string | null | undefined, locale = "ar"): string | null {
  const c = countryCodeOf(code);
  if (!c) return null;
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(c) ?? c;
  } catch {
    return c;
  }
}

export type CountryOption = { code: string; name: string };

/** قائمة الاختيار: كل البلدان بأسمائها بلغة الواجهة، مرتبة أبجدياً. */
export function countryOptions(locale = "ar"): CountryOption[] {
  return COUNTRY_CODES.map((code) => ({ code, name: countryName(code, locale) ?? code })).sort((a, b) =>
    a.name.localeCompare(b.name, locale),
  );
}
