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

/**
 * جذع خفيف للكلمة (بعد matchKey): بلا «ال» والسوابق المتصلة، وبلا لواحق الجمع والضمير الشائعة،
 * وبلا حرف المضارعة في الفعل الرباعي الحروف («يصوم» ← «صوم» كما «الصوم» ← «صوم»).
 */
export function stem(word: string): string {
  let w = word;
  if (/[؀-ۿ]/.test(w)) {
    if (w.length >= 5) w = w.replace(/^(?:وال|فال|بال|كال|لل|ال)/, "");
    if (w.length >= 5) w = w.replace(/^[وفبل](?=ال)/, "").replace(/^ال/, "");
    if (w.length >= 6) w = w.replace(/(?:ات|ون|ين|ها|هم|كم)$/, "");
    if (w.length === 4 && /^[يتن]/.test(w)) w = w.slice(1);
  } else {
    w = w.replace(/(?:'s|s)$/, "");
  }
  return w;
}

const TOKEN_STOP = /^(?:of|the|a|an|in|to|is|are|de|la|le|des|du|et|en|kimdir|nedir|ne|mi|apa|siapa|ما|ماذا|من|في|عن|علي|هو|هي|کے|کی|کا|ہے)$/i;

function stems(text: string): string[] {
  return matchKey(text)
    .split(" ")
    .filter((w) => w && !TOKEN_STOP.test(w))
    .map(stem)
    .filter((w) => w.length >= 3);
}

const PATTERNS = BASICS.map((e) => ({
  entry: e,
  patterns: e.match.map((p) => ({ len: matchKey(p).length, re: phrasePattern(p), stems: stems(p) })),
}));

/**
 * الأسئلة الأساسية المطابقة للسؤال (حتى max)، الأطول عبارةً أولاً:
 *  1) العبارة نفسها (بحدود الكلمة)، أو
 *  2) كل كلمات العبارة بجذوعها في السؤال، بأي ترتيب («لماذا يصوم المسلمون» ← «الصوم»).
 * الكلمة الواحدة القصيرة (أقل من 4 حروف بعد الجذع) لا تطابق بالجذع («بوضوح» ليست «وضو»).
 */
export function matchBasics(question: string, max = 2): BasicEntry[] {
  const q = matchKey(question);
  const have = new Set(stems(question));
  const scoreOf = (p: (typeof PATTERNS)[number]["patterns"][number]) => {
    // العبارة نفسها مقدَّمة دائماً على المطابقة بالجذوع («rukun iman» قبل «rukun … islam» المتفرقة).
    if (p.re.test(q)) return 1000 + p.len;
    if (!p.stems.length) return 0;
    if (p.stems.length === 1 && p.stems[0].length < 3) return 0;
    return p.stems.every((x) => have.has(x)) ? p.len : 0;
  };
  return PATTERNS.map(({ entry, patterns }) => ({ entry, best: Math.max(0, ...patterns.map(scoreOf)) }))
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
