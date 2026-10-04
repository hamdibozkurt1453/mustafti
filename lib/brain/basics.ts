import basics from "@/data/basics.json";
import { matchKey } from "./guard";

/**
 * قاعدة «الأساسيات» (data/basics.json): لنحو أربعين سؤالاً أساسياً مراجعُ فقط بلا نص ديني —
 * آيات بأرقامها، وكلمات بحث حديث، وأرقام أسئلة «بيّنات». النصوص تُجلب من المصادر عند الطلب
 * (retrieval.ts) وتُعطى درجة الصلة 3 مباشرة.
 */

export type BasicEntry = {
  id: string;
  topic_ar: string;
  match: string[];
  verses: string[];
  hadithQueries: string[];
  bayyinat: number[];
};

export const BASICS: BasicEntry[] = basics.entries as BasicEntry[];

/** مرجع آية: «2:183» أو «2:183-185». */
export type VerseRef = { surah: number; ayah: number; through?: number };

export function parseVerseRef(ref: string): VerseRef | null {
  const m = ref.match(/^(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/);
  if (!m) return null;
  const [surah, ayah, through] = [Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : undefined];
  if (surah < 1 || surah > 114 || ayah < 1 || (through !== undefined && through < ayah)) return null;
  return { surah, ayah, through };
}

/** عبارة المطابقة في أول كلمة (مع سوابق العربية المتصلة و ف ب ل). */
function phrasePattern(phrase: string): RegExp {
  const key = matchKey(phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefix = /[؀-ۿ]/.test(key) ? "(?:[وفبل])?" : "";
  // العبارة القصيرة كلمة كاملة («وضو» لا تطابق «بوضوح»)، والطويلة مفتوحة النهاية للّواحق (kimlere).
  const end = key.length <= 4 ? "(?![\\p{L}\\p{N}])" : "";
  return new RegExp(`(?<![\\p{L}\\p{N}])${prefix}${key}${end}`, "u");
}

const PATTERNS = BASICS.map((e) => ({ entry: e, patterns: e.match.map((p) => ({ len: matchKey(p).length, re: phrasePattern(p) })) }));

/** الأسئلة الأساسية المطابقة للسؤال (حتى max)، الأطول عبارةً أولاً. */
export function matchBasics(question: string, max = 2): BasicEntry[] {
  const q = matchKey(question);
  return PATTERNS.map(({ entry, patterns }) => ({ entry, best: Math.max(0, ...patterns.filter((p) => p.re.test(q)).map((p) => p.len)) }))
    .filter((x) => x.best > 0)
    .sort((a, b) => b.best - a.best)
    .slice(0, max)
    .map((x) => x.entry);
}

/**
 * مراجع الآيات المذكورة في السؤال نفسه: «2:255» أو «(البقرة: 255)» بالأرقام. والآية المنقولة
 * بنصها تُحدَّد بالبحث في القرآن (retrieval.ts: quotedVerses).
 */
export function verseRefsInText(text: string): VerseRef[] {
  return [...text.matchAll(/(?<!\d)(\d{1,3})\s*[:：]\s*(\d{1,3})(?:\s*-\s*(\d{1,3}))?(?!\d)/g)]
    .map((m) => parseVerseRef(`${m[1]}:${m[2]}${m[3] ? `-${m[3]}` : ""}`))
    .filter((r): r is VerseRef => r !== null)
    .slice(0, 3);
}

/** نص آية منقول في السؤال: بين ﴿ ﴾ أو بعد «قال (الله) تعالى». */
export function quotedVerses(text: string): string[] {
  const out = [...text.matchAll(/﴿([^﴾]{6,300})﴾/g)].map((m) => m[1].trim());
  const said = text.match(/قال\s+(?:الله\s+)?(?:تعالى|عز\s+وجل|سبحانه)\s*:?\s*[«"]?([^»"؟?،\n]{6,200})/u)?.[1];
  if (!out.length && said) out.push(said.trim());
  return out.slice(0, 2);
}
