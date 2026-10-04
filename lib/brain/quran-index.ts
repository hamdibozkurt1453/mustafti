import index from "@/data/quran-index.json";

/**
 * فهرس سور المصحف (data/quran-index.json، من بيانات Tanzil الوصفية): الاسم والعدد والنوع.
 * رد get_quran_verses لا يذكر اسم السورة، والاسم الذي يرد في نص التفسير قد يكون لسورة أخرى
 * («سبق الكلام عليها في أول سورة البقرة» في تفسير 3:1). لذلك اسم السورة من الفهرس وحده.
 * نقي بلا شبكة (يُختبر محلياً).
 */

export type SurahMeta = { n: number; ar: string; en: string; verses: number; type: "makki" | "madani" };

export const SURAHS: SurahMeta[] = index.surahs as SurahMeta[];
export const SURAH_COUNT = SURAHS.length;
export const INDEX_SOURCE = "فهرس سور المصحف";

export function surahMeta(n: number): SurahMeta | undefined {
  return Number.isInteger(n) && n >= 1 && n <= SURAHS.length ? SURAHS[n - 1] : undefined;
}

/** رابط السورة في موسوعة المحتوى الإسلامي. */
export function surahUrl(n: number, ayah?: number): string {
  return `https://islamenc.com/ar/quran/${n}${ayah ? `/${ayah}` : ""}`;
}

/** «سورة آل عمران — الآية 1» أو «— الآيات 1-3». */
export function verseTitle(surah: number, ayah: number, through?: number): string {
  const name = surahMeta(surah)?.ar;
  const part = through && through > ayah ? `الآيات ${ayah}-${through}` : `الآية ${ayah}`;
  return name ? `سورة ${name} — ${part}` : `${surah}:${ayah}${through && through > ayah ? `-${through}` : ""}`;
}

/** هل الآية ضمن عدد آيات سورتها؟ */
export function isValidVerse(surah: number, ayah: number): boolean {
  const s = surahMeta(surah);
  return Boolean(s && ayah >= 1 && ayah <= s.verses);
}

/** نص تعريف السورة من الفهرس: «سورة آل عمران — رقم 3 في ترتيب المصحف — عدد آياتها 200 — مدنية». */
export function surahInfoLine(n: number): string | null {
  const s = surahMeta(n);
  if (!s) return null;
  return `سورة ${s.ar} — رقم ${s.n} في ترتيب المصحف — عدد آياتها ${s.verses} — ${s.type === "makki" ? "مكية" : "مدنية"}`;
}

/** نص الفهرس العام: عدد السور وأولها وآخرها. */
export function indexSummaryLine(): string {
  const first = SURAHS[0];
  const last = SURAHS[SURAHS.length - 1];
  const verses = SURAHS.reduce((s, x) => s + x.verses, 0);
  return `عدد سور القرآن الكريم في المصحف ${SURAHS.length} سورة، أولها سورة ${first.ar} وآخرها سورة ${last.ar}، ومجموع آياتها ${verses} آية.`;
}

// ---------------------------------------------------------------------------
// قراءة رد get_quran_verses
// ---------------------------------------------------------------------------

export type ParsedVerse = { surah: number; ayah: number; arabic: string; note: string };

/**
 * يقرأ رد get_quran_verses (بأسطره) إلى آيات: «[3:1]» ثم سطر النص العربي ثم الترجمة أو
 * التفسير، ورابط «Source:». ويحذف علامات الخادم («[Surah 3, translation …]»، «[EXACT]»،
 * الفواصل، الحواشي). لا يأخذ اسم سورة من النص أبداً.
 */
export function parseVerseText(raw: string): { verses: ParsedVerse[]; sourceUrl?: string } {
  const sourceUrl = raw.match(/Source:\s*(https?:\/\/\S+)/)?.[1];
  const lines = raw
    .replace(/─{3,}\s*(?:CITE|END OF RETRIEVED TEXT)[\s\S]*$/i, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(
      (l) =>
        l &&
        !/─{3,}/.test(l) &&
        !/^\[Surah\s+\d+/i.test(l) &&
        !/^\[\/?[A-Z][A-Z _-]{2,}\]/.test(l) &&
        !/^Source:/i.test(l) &&
        !/^(CITE|Every (result|item))/i.test(l),
    );
  const verses: ParsedVerse[] = [];
  let current: ParsedVerse | null = null;
  let inFootnotes = false;
  for (const line of lines) {
    // الحواشي في آخر الرد (وفيها «[1:1] …») ليست آيات.
    if (/^Footnotes?:/i.test(line)) {
      inFootnotes = true;
      continue;
    }
    const marker = line.match(/^\[(\d{1,3}):(\d{1,3})\]\s*(.*)$/);
    // في الحواشي: «[1:1] نص» حاشية، أما «[1:2]» وحدها في سطرها فآية جديدة.
    if (inFootnotes && !(marker && !marker[3])) continue;
    if (marker) {
      inFootnotes = false;
      current = { surah: Number(marker[1]), ayah: Number(marker[2]), arabic: "", note: "" };
      verses.push(current);
      if (marker[3]) current.arabic = marker[3].trim();
      continue;
    }
    if (!current) continue;
    if (!current.arabic && /\p{Script=Arabic}/u.test(line)) current.arabic = line;
    else current.note = `${current.note} ${line}`.trim();
  }
  for (const v of verses) v.note = v.note.replace(/\[\d{1,3}\]/g, "").replace(/^\d{1,3}\.\s*/, "").replace(/\s+/g, " ").trim();
  return { verses: verses.filter((v) => /\p{Script=Arabic}/u.test(v.arabic)), sourceUrl };
}

/** ينظف نص أي مصدر للعرض: بلا علامات الخادم ولا «[3:1]» ولا «Source: …». */
export function cleanForDisplay(text: string): string {
  return text
    .replace(/\[Surah\s+\d+[^\]]*\]/gi, " ")
    .replace(/\[\/?[A-Z][A-Z _-]{2,}\][^\n]*?(?=\n|$)/g, (m) => (/reproduce|exactly|attributed|say so/i.test(m) ? " " : m.replace(/\[\/?[A-Z][A-Z _-]{2,}\]/, " ")))
    .replace(/\[\d{1,3}:\d{1,3}\]/g, " ")
    .replace(/Source:\s*https?:\/\/\S+/gi, " ")
    .replace(/─{3,}[^\n]*/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// الآية المذكورة صراحةً في السؤال: «سورة يونس آية 2»، «السورة رقم 10 الآية 2»،
// «الآية الثانية من سورة يونس»، «2:255»، «Surah 10 verse 2»، «Al-Baqarah 255».
// ---------------------------------------------------------------------------

/** توحيد عربي للمطابقة: بلا تشكيل، والألفات ألفاً، والتاء المربوطة هاءً، والألف المقصورة ياءً. */
function normAr(text: string): string {
  return text
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ");
}

const normEn = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "").replace(/^(al|an|at|ad|ar|as|ash|az|az)(?=[a-z]{3})/, "");

/** الأعداد الترتيبية 1–10 (مذكراً ومؤنثاً) بعد التوحيد. */
const ORDINALS: [RegExp, number][] = [
  [/^ال(?:اولي|اول)$/, 1],
  [/^الثاني(?:ه)?$/, 2],
  [/^الثالث(?:ه)?$/, 3],
  [/^الرابع(?:ه)?$/, 4],
  [/^الخامس(?:ه)?$/, 5],
  [/^السادس(?:ه)?$/, 6],
  [/^السابع(?:ه)?$/, 7],
  [/^الثامن(?:ه)?$/, 8],
  [/^التاسع(?:ه)?$/, 9],
  [/^العاشر(?:ه)?$/, 10],
];

function ordinal(word: string | undefined): number | undefined {
  return word ? ORDINALS.find(([re]) => re.test(word))?.[1] : undefined;
}

const AR_NAMES = SURAHS.map((s) => ({ n: s.n, key: normAr(s.ar).replace(/^ال/, "") }));
const EN_NAMES = SURAHS.map((s) => ({ n: s.n, key: normEn(s.en) }));

/** رقم السورة من الاسم بعد «سورة» (كلمتان أو كلمة). */
function surahByArName(words: string[]): number | undefined {
  for (const take of [2, 1]) {
    const key = words.slice(0, take).join(" ").replace(/^ال/, "");
    const hit = AR_NAMES.find((x) => x.key === key);
    if (hit) return hit.n;
  }
  return undefined;
}

/** رقم السورة المذكورة في السؤال (رقماً، أو ترتيباً، أو اسماً عربياً أو إنجليزياً). */
function surahInText(ar: string, raw: string): number | undefined {
  const num = ar.match(/(?:^|\s)(?:ال)?سوره\s*(?:رقم\s*)?(\d{1,3})(?!\d)/)?.[1];
  if (num) return Number(num);
  const after = ar.match(/(?:^|\s)(?:ال)?سوره\s+(\S+)(?:\s+(\S+))?/);
  if (after) {
    const ord = ordinal(after[1]);
    if (ord) return ord;
    const byName = surahByArName([after[1], after[2] ?? ""].filter(Boolean));
    if (byName) return byName;
  }
  const en = raw.match(/\bsurah?\s*(?:no\.?|number|#)?\s*(\d{1,3})\b/i)?.[1];
  if (en) return Number(en);
  const enName = raw.match(/\b(?:surah?|sura)\s+([a-z'\- ]{2,20}?)(?=\s*(?:,|:|verse|ayah|ayat|\d|$))/i)?.[1];
  if (enName) return EN_NAMES.find((x) => x.key === normEn(enName))?.n;
  return undefined;
}

/** رقم الآية المذكورة في السؤال (رقماً أو ترتيباً). */
function ayahInText(ar: string, raw: string): number | undefined {
  const num = ar.match(/(?:^|\s)(?:ال)?ايه\s*(?:رقم\s*)?(\d{1,3})(?!\d)/)?.[1];
  if (num) return Number(num);
  const ord = ordinal(ar.match(/(?:^|\s)(?:ال)?ايه\s+(\S+)/)?.[1]);
  if (ord) return ord;
  const en = raw.match(/\b(?:verse|ayah|ayat|aya|āyah)\s*(?:no\.?|number|#)?\s*(\d{1,3})\b/i)?.[1];
  return en ? Number(en) : undefined;
}

/**
 * الآية المذكورة صراحةً في السؤال (رقم السورة أو اسمها أو ترتيبها + رقم الآية أو ترتيبها).
 * لا شيء إن لم تُذكر السورة والآية معاً، أو كانت الآية خارج عدد آيات سورتها.
 */
export function explicitVerseRef(text: string): { surah: number; ayah: number } | null {
  const ar = normAr(text);
  const surah = surahInText(ar, text);
  const ayah = ayahInText(ar, text);
  if (surah && ayah && isValidVerse(surah, ayah)) return { surah, ayah };
  // «Al-Baqarah 255» أو «البقرة 255» بلا كلمة «آية».
  const nameNum = ar.match(/(?:^|\s)(?:سوره\s+)?(\S+(?:\s\S+)?)\s+(\d{1,3})(?!\s*[:：\d])/);
  if (nameNum && !surah) {
    const n = surahByArName(nameNum[1].split(" ").slice(-2)) ?? surahByArName(nameNum[1].split(" ").slice(-1));
    if (n && isValidVerse(n, Number(nameNum[2]))) return { surah: n, ayah: Number(nameNum[2]) };
  }
  return null;
}
