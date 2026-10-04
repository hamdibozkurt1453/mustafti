import glossary from "@/data/glossary.json";

/**
 * قاموس المصطلحات (data/glossary.json) من جدول المرجعية (ص 7).
 * المقابل المعتمد يُستعمل كما هو؛ وإن لم يوجد مقابل معتمد للغة السائل يبقى المصطلح العربي مع شرحه.
 */

export type GlossaryTerm = {
  id: string;
  term_ar: string;
  aliases: string[];
  en: string;
  usage_ar: string;
  keepArabic: boolean;
  equivalents: Record<string, string | null | undefined>;
};

export const GLOSSARY: GlossaryTerm[] = glossary.terms as GlossaryTerm[];

function baseLang(lang: string): string {
  return lang.toLowerCase().split(/[-_]/)[0];
}

/** يزيل التشكيل والتطويل ويوحّد الألف، للمطابقة فقط. */
export function normalizeArabic(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[ً-ٰٟۖ-ۭـ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase();
}

/** نمط كلمة كاملة للمصطلح، مع سوابق العربية المتصلة (و ف ب ل ك ال): «الوحي» لا تطابق «التوحيد». */
function aliasPattern(alias: string): RegExp {
  const word = normalizeArabic(alias).replace(/^ال/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefix = /[\u0600-\u06FF]/.test(word) ? "(?:[وفبلك])?(?:ال)?" : "";
  return new RegExp(`(?<![\\p{L}\\p{M}])${prefix}${word}(?![\\p{L}\\p{M}])`, "u");
}

const PATTERNS = new Map(GLOSSARY.map((t) => [t.id, t.aliases.map(aliasPattern)]));

/** المصطلحات التي وردت في نص (السؤال أو النصوص المسترجعة). */
export function findTerms(text: string): GlossaryTerm[] {
  const hay = normalizeArabic(text);
  return GLOSSARY.filter((t) => PATTERNS.get(t.id)!.some((re) => re.test(hay)));
}

/** المقابل المعتمد للغة، أو null إن لم يوجد (فيبقى المصطلح العربي مع شرحه). */
export function equivalentFor(term: GlossaryTerm, lang: string): string | null {
  const l = baseLang(lang);
  if (l === "ar") return term.term_ar;
  return term.equivalents[l] ?? null;
}

/**
 * كتلة القاموس في التعليمات: المصطلحات الواردة فقط (أو الكل إن طُلب)، مع المقابل وضابط الاستخدام.
 */
export function glossaryBlock(lang: string, text: string, all = false): string {
  const terms = all ? GLOSSARY : findTerms(text);
  if (!terms.length) return "";
  const lines = terms.map((t) => {
    const eq = equivalentFor(t, lang);
    const rendering = eq
      ? `approved equivalent: "${eq}"${t.keepArabic ? ` (keep the Arabic term "${t.term_ar}" next to it)` : ""}`
      : `no approved equivalent in this language: keep the Arabic term "${t.term_ar}" (transliterated if needed) and explain it`;
    return `- ${t.term_ar} — ${rendering}. Usage rule (verbatim from the reference): «${t.usage_ar}»`;
  });
  return `APPROVED GLOSSARY (data/glossary.json, from the official reference):\n${lines.join("\n")}`;
}
