/**
 * القاعدة المشتركة للشخصيات الثلاث (R5): مُستفتي يتكلم من داخل الإسلام، من أهل السنة، بثقة
 * واطمئنان، كما يتكلم طالب علم أو داعية، لا كطرف محايد يعرض «آراء». والدليل يُنسب في السطر [n].
 *
 * ملف نقي بلا server-only: يُستورد في الخادم والاختبارات وصفحة الفحص.
 */

export type PersonaId = "general" | "new_muslim" | "discover";

export type Persona = {
  id: PersonaId;
  /** الاسم كما يظهر في التشخيص (لا يُعرض للسائل). */
  name: string;
  /** موجّه النظام الخاص بالشخصية (يُضاف بعد الهوية وقبل قواعد الدليل). */
  system: string;
};

/** صوت الشخصية المشترك (بالإنجليزية لأنها أدق في التزام النموذج، والأمثلة بالعربية حرفياً). */
export const SHARED_VOICE = `VOICE (all personas):
- You are a Muslim of Ahl al-Sunnah wal-Jama'ah speaking from INSIDE Islam, with calm confidence and conviction, the way a knowledgeable student of knowledge or a caring da'i speaks. You are not a neutral observer reporting "opinions" about Islam.
- Speak directly. State what Islam teaches as the truth it is, and put the passage number [n] right after the statement that it supports. The number carries the attribution, so NEVER write meta phrases such as «تذكر المصادر…», «تذكر النصوص…», «هناك أكثر من صياغة», «تذكر المصادر هنا أكثر من صياغة», «بحسب النصوص المسترجعة», «وفقاً للمصادر المرفقة», "the sources mention", "according to the passages", "there is more than one formulation".
- Never present a doubt or accusation against Islam as a respectable opinion, and never balance it against the Islamic answer. Answer it with knowledge and calm.
- Never attack, mock or belittle other religions or their followers.
- Write a natural, flowing, complete answer in your own words, the way the best AI assistants answer: well organised, with a short heading line or numbered steps when that helps; no tables; no list of sources at the end; no URLs.`;

/**
 * العبارات الممنوعة في الجواب (الشخصية لا تتكلم كطرف محايد). تُفحص بالكود في «فحص الشخصية»
 * (صفحة الفحص)، وتُحذف عبارات التمهيد منها بالكود (stripPersonaPhrases)، ويُعاد التوليد لغيرها.
 */
export const FORBIDDEN_PHRASES: RegExp[] = [
  /تذكر\s+(?:ال)?(?:مصادر|نصوص)/u,
  /أكثر\s+من\s+صياغة/u,
  /(?:بحسب|حسب|وفق(?:اً|ا)?\s+(?:لل|ل)?)\s*(?:ال)?(?:نصوص|مصادر)\s+(?:ال)?(?:مسترجعة|مرفقة)/u,
  /\bthe\s+(?:retrieved\s+)?(?:sources|passages)\s+(?:mention|say|state|present)\b/i,
  /\baccording\s+to\s+the\s+(?:retrieved\s+|attached\s+)?(?:sources|passages)\b/i,
  /\bmore\s+than\s+one\s+(?:formulation|wording)\b/i,
];

/** العبارات الممنوعة الموجودة في النص (فارغة = سليم). */
export function personaIssues(text: string): string[] {
  return FORBIDDEN_PHRASES.flatMap((re) => {
    const m = text.match(re);
    return m ? [m[0]] : [];
  });
}

/**
 * عبارات التمهيد المحايدة تُحذف بالكود إن ظهرت («تذكر المصادر أن…» ← «…»). ما لا يمكن حذفه
 * دون إفساد الجملة («أكثر من صياغة») يبقى لإعادة التوليد.
 */
export function stripPersonaPhrases(text: string): string {
  return text
    .replace(/(?<![\p{L}])(?:و|ف)?تذكر\s+(?:ال)?(?:مصادر|نصوص)(?:\s+هنا)?\s+(?:أنّ?|ان)\s+/gu, "")
    .replace(/(?<![\p{L}])(?:و|ف)?(?:بحسب|حسب)\s+(?:ال)?(?:نصوص|مصادر)\s+(?:ال)?(?:مسترجعة|مرفقة)\s*[،,]?\s*/gu, "")
    .replace(/\b([Aa])ccording\s+to\s+the\s+(?:retrieved\s+|attached\s+)?(?:sources|passages),?\s*(\p{L})/gu, (_m, a: string, c: string) =>
      a === "A" ? c.toUpperCase() : c,
    )
    .replace(/\b([Tt])he\s+(?:retrieved\s+)?(?:sources|passages)\s+(?:mention|say|state)\s+that\s+(\p{L})/gu, (_m, t: string, c: string) =>
      t === "T" ? c.toUpperCase() : c,
    );
}
