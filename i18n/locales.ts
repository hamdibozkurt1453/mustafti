/** لغات الواجهة الاثنتا عشرة (الخطة، القسم 0.3). العربية افتراضية. */
export const locales = [
  "ar", "en", "id", "ur", "bn", "tr", "fa", "fr", "ms", "ru", "sw", "ha",
] as const;

export type Locale = (typeof locales)[number];

/**
 * F4: اللغات المفعّلة في الواجهة: العربية والإنجليزية وحدهما (ترجمات R2 إلى F3 مكتملة فيهما فقط).
 * اللغات العشر الأخرى تبقى ملفاتها وبنيتها كما هي، ومساراتها تحوّل إلى /en (next.config.ts).
 * لإعادة تفعيل لغة: أضفها هنا فقط. (المحادثة نفسها تجيب بأي لغة يكتب بها السائل، في المحرك.)
 */
export const ENABLED_LOCALES = ["ar", "en"] as const satisfies readonly Locale[];
export type EnabledLocale = (typeof ENABLED_LOCALES)[number];

/** اللغات المعطّلة في الواجهة (مساراتها تحوّل إلى /en). */
export const DISABLED_LOCALES: Locale[] = locales.filter((l) => !(ENABLED_LOCALES as readonly string[]).includes(l));

export function isEnabledLocale(l: string): l is EnabledLocale {
  return (ENABLED_LOCALES as readonly string[]).includes(l);
}

export const defaultLocale: Locale = "ar";

/** اللغات التي تُكتب من اليمين إلى اليسار. */
export const rtlLocales: readonly Locale[] = ["ar", "ur", "fa"];

export function getDirection(locale: string): "rtl" | "ltr" {
  return (rtlLocales as readonly string[]).includes(locale) ? "rtl" : "ltr";
}

/** اسم كل لغة بلغتها، لزر اللغة. */
export const localeNames: Record<Locale, string> = {
  ar: "العربية",
  en: "English",
  id: "Bahasa Indonesia",
  ur: "اردو",
  bn: "বাংলা",
  tr: "Türkçe",
  fa: "فارسی",
  fr: "Français",
  ms: "Bahasa Melayu",
  ru: "Русский",
  sw: "Kiswahili",
  ha: "Hausa",
};
