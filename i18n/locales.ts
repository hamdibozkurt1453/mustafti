/** لغات الواجهة الاثنتا عشرة (الخطة، القسم 0.3). العربية افتراضية. */
export const locales = [
  "ar", "en", "id", "ur", "bn", "tr", "fa", "fr", "ms", "ru", "sw", "ha",
] as const;

export type Locale = (typeof locales)[number];

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
