/**
 * ثوابت القرآن المشتركة: مفاتيح ترجمات موسوعة القرآن (quranenc) لكل لغة واجهة،
 * وروابط الآيات فيها. المفاتيح نفسها يقبلها خادم MCP (get_quran_verses: translation_key).
 */
export const QURANENC_TRANSLATIONS: Record<string, string> = {
  ar: "arabic_moyassar",
  en: "english_saheeh",
  fr: "french_montada",
  tr: "turkish_shaban",
  ur: "urdu_junagarhi",
  id: "indonesian_affairs",
  bn: "bengali_zakaria",
  ru: "russian_kuliev",
  fa: "persian_ih",
  ms: "malay_basumayyah",
  sw: "swahili_barawani",
  ha: "hausa_gummi",
};

/** مفتاح الترجمة المعتمد للغة (الإنجليزية إن لم تكن لها ترجمة هنا). */
export function translationKey(lang: string): string {
  return QURANENC_TRANSLATIONS[lang] ?? QURANENC_TRANSLATIONS.en;
}

/** رابط الآية في موسوعة القرآن الكريم. */
export function quranencUrl(surah: number, ayah: number | undefined, lang: string, key = translationKey(lang)): string {
  const ui = lang === "ar" ? "ar" : "en";
  return `https://quranenc.com/${ui}/browse/${key}/${surah}${ayah ? `#${ayah}` : ""}`;
}
