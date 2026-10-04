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
