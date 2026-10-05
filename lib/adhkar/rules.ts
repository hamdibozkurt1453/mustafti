/**
 * قواعد الأذكار النقية (بلا شبكة ولا قاعدة)، فتُختبر محلياً. كل ما هنا **استخراج** من نص المصدر،
 * لا توليد: الدرجة كما كتبها المصدر، والعدد كما ورد في لفظ الحديث، والوقت من لفظه أيضاً.
 */

export const OCCASIONS = ["morning", "evening", "after_prayer"] as const;
export type Occasion = (typeof OCCASIONS)[number];

/** صف في جدول adhkar (لغة واحدة لذكر واحد). */
export type DhikrRow = {
  hadith_id: string;
  lang: string;
  occasions: Occasion[];
  position: number;
  title: string | null;
  text: string;
  explanation: string | null;
  grade: string;
  repeat_count: number | null;
  source_url: string;
};

const strip = (s: string) => s.normalize("NFC").replace(/[\u064B-\u0652\u0670\u0640]/g, "");

/**
 * يُدرج الذكر فقط إن كانت درجته «صحيح» أو «حسن» كما كتبها المصدر (ومنها «حسن صحيح» و«صحيح لغيره»)،
 * ولا يُدرج ما فيه ضعف أو وضع أو نكارة، ولا ما لا درجة له.
 */
export function isAcceptedGrade(grade: string | null | undefined): boolean {
  const g = strip(grade ?? "").toLowerCase();
  if (!g.trim()) return false;
  if (/ضعيف|موضوع|منكر|شاذ|لا يصح|لا أصل|لا اصل|باطل|مكذوب|weak|da['’]?[iī]f|fabricated|munkar|mawdu/i.test(g)) return false;
  return /صحيح|حسن|sahih|saheeh|hasan|authentic|sound|good/i.test(g);
}

const NUMBER_WORDS: [RegExp, number][] = [
  [/(?:ثلاثا|ثلاث) وثلاثين/, 33],
  [/(?:اربعا|أربعا|اربع|أربع) وثلاثين/, 34],
  [/(?:مائه|مائة|مئه|مئة)/, 100],
  [/(?:عشرا|عشر)/, 10],
  [/(?:سبعا|سبع)/, 7],
  [/(?:ثلاثا|ثلاث)/, 3],
];

/**
 * عدد المرات من لفظ الحديث العربي: «ثلاث مرات» و«مائة مرة» و«مرتين» و«ثلاثاً وثلاثين»…
 * يعيد null إن لم يُذكر عدد، أو اختلفت الأعداد في الحديث الواحد (فلا نختار عنه).
 */
export function repeatCount(arabic: string): number | null {
  const s = strip(arabic).replace(/[أإآ]/g, "ا");
  const found = new Set<number>();
  if (/مرتين|مرتان/.test(s)) found.add(2);
  for (const m of s.matchAll(/(\d{1,3})\s*(?:مرات|مره|مرة)/g)) found.add(Number(m[1]));
  for (const m of s.matchAll(/([\u0621-\u064A]+(?: و[\u0621-\u064A]+)?)\s+(?:مرات|مره|مرة)/g)) {
    const phrase = m[1].replace(/[أإآ]/g, "ا");
    const hit = NUMBER_WORDS.find(([re]) => re.test(phrase));
    if (hit) found.add(hit[1]);
  }
  // «ثلاثاً وثلاثين» بلا كلمة «مرة» (التسبيح بعد الصلاة).
  for (const [re, n] of NUMBER_WORDS.slice(0, 2)) if (re.test(s.replace(/[أإآ]/g, "ا"))) found.add(n);
  // 33 و34 معاً في حديث التسبيح: العدد الغالب 33 (والتكبير 34 في نصه).
  if (found.has(33) && found.has(34)) found.delete(34);
  return found.size === 1 ? [...found][0] : null;
}

/**
 * وقت الذكر في باب «أذكار الصباح والمساء» من لفظه: «أصبح» للصباح، و«أمسى» للمساء،
 * وما ذكرهما معاً أو لم يذكر أحدهما يُعرض في التبويبين.
 */
export function morningEvening(arabic: string): Occasion[] {
  const s = strip(arabic);
  const morning = /أصبح|اصبح|الصباح|يصبح|نصبح|الفجر|غدوة/.test(s);
  const evening = /أمسى|امسى|أمسي|امسي|المساء|يمسي|نمسي|عشية/.test(s);
  if (morning && !evening) return ["morning"];
  if (evening && !morning) return ["evening"];
  return ["morning", "evening"];
}

/**
 * باب الأذكار في الموسوعة من عنوانه: فيه «أذكار» (أو «الأذكار») مع «الصباح» أو «المساء» أو
 * «بعد الصلاة» أو «أدبار الصلوات». فلا يُلتقط باب آخر فيه «الصباح» وحدها (مثل «صلاة الصبح»).
 */
export function classifyCategory(title: string): "morningEvening" | "afterPrayer" | null {
  const s = strip(title).replace(/[أإآ]/g, "ا");
  const adhkar = /(?:^|[\s(«"،-])(?:وال|ال)?اذكار|\b(?:adhkar|azkar|dhikr|remembrances?|supplications?)\b/i.test(s);
  if (!adhkar) return null;
  if (/الصباح|المساء|morning|evening/i.test(s)) return "morningEvening";
  if (/بعد الصلاه|بعد الصلاة|ادبار الصلوات|دبر الصلاه|دبر الصلاة|بعد السلام|after (the )?prayers?/i.test(s)) return "afterPrayer";
  return null;
}

/** رابط الحديث في موسوعة الأحاديث بلغة العرض. */
export function hadeethencUrl(id: string, lang: string): string {
  return `https://hadeethenc.com/${lang}/browse/hadith/${encodeURIComponent(id)}`;
}
