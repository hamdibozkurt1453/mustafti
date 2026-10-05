import { clip, htmlToText } from "./html";

/**
 * الدرر السنية — تحليل رد dorar_api.json (نقي، بلا server-only): يستعمله متصفح السائل (DorarCard،
 * لأن موقع الدرر يحجب خادمنا بـ 403)، وصفحة الفحص على الخادم للتوثيق.
 * لكل حديث: النص، والراوي، والمحدث، والمصدر، والصفحة أو الرقم، و«خلاصة حكم المحدث» حرفياً.
 * ولا يُقبل حديث بلا حكم (لا حديث بلا درجة). الرابط صفحة البحث في الموقع.
 */

export const DORAR_API = "https://dorar.net/dorar_api.json";
export const DORAR_NAME = "الدرر السنية — الموسوعة الحديثية";
const MAX = 6;

export type DorarHadith = {
  text: string;
  rawi?: string;
  muhaddith?: string;
  book?: string;
  page?: string;
  /** «خلاصة حكم المحدث» حرفياً. */
  grade: string;
  url: string;
};

export function dorarSearchUrl(query: string): string {
  return `https://dorar.net/hadith/search?q=${encodeURIComponent(query.trim())}`;
}

/** الحقول بعناوينها في الموقع (الأطول أولاً، لأن «المحدث» جزء من «خلاصة حكم المحدث»). */
const LABELS: [keyof Omit<DorarHadith, "text" | "url">, string][] = [
  ["grade", "خلاصة حكم المحدث"],
  ["page", "الصفحة أو الرقم"],
  ["muhaddith", "المحدث"],
  ["rawi", "الراوي"],
  ["book", "المصدر"],
];

/** يقرأ الحقول من نص سطر المعلومات: كل عنوان «X:» وقيمته حتى العنوان التالي. */
export function parseInfo(info: string): Partial<Record<(typeof LABELS)[number][0], string>> {
  const marks: { key: (typeof LABELS)[number][0]; start: number; end: number }[] = [];
  const taken: [number, number][] = [];
  for (const [key, label] of LABELS) {
    const re = new RegExp(`${label}\\s*[:：]`, "g");
    for (const m of info.matchAll(re)) {
      const s = m.index ?? 0;
      const e = s + m[0].length;
      if (taken.some(([a, b]) => s < b && e > a)) continue; // «المحدث» داخل «خلاصة حكم المحدث»
      taken.push([s, e]);
      marks.push({ key, start: s, end: e });
      break;
    }
  }
  marks.sort((a, b) => a.start - b.start);
  const out: Partial<Record<(typeof LABELS)[number][0], string>> = {};
  marks.forEach((m, i) => {
    const value = info
      .slice(m.end, marks[i + 1]?.start ?? info.length)
      .replace(/^[\s\-–|:]+|[\s\-–|]+$/g, "")
      .trim();
    if (value) out[m.key] = value;
  });
  return out;
}

export const HADITH_DIV = /<div\b[^>]*class\s*=\s*["'](?:[^"']*\s)?hadith(?:\s[^"']*)?["'][^>]*>/gi;
const INFO_DIV = /<div\b[^>]*class\s*=\s*["'][^"']*hadith-info[^"']*["'][^>]*>/i;

/**
 * يحلل HTML النتائج. الأحاديث تُفصل بوسم div.hadith إن وُجد، وإلا بفاصل <hr>.
 * نص الحديث ما قبل سطر المعلومات (بلا رقمه «1 -»)، والحقول من سطر المعلومات.
 */
export function parseDorarHtml(html: string, query: string, max = MAX): DorarHadith[] {
  if (!html || typeof html !== "string") return [];
  const starts = [...html.matchAll(HADITH_DIV)].map((m) => m.index ?? 0);
  const blocks = starts.length
    ? starts.map((s, i) => html.slice(s, starts[i + 1] ?? html.length))
    : html.split(/<hr\b[^>]*>/i);
  const url = dorarSearchUrl(query);
  const out: DorarHadith[] = [];
  for (const block of blocks) {
    if (out.length >= max) break;
    const infoAt = block.search(INFO_DIV);
    let textPart: string;
    let infoPart: string;
    if (infoAt !== -1) {
      textPart = htmlToText(block.slice(0, infoAt));
      infoPart = htmlToText(block.slice(infoAt));
    } else {
      // بلا وسم المعلومات: النص ما قبل أول عنوان.
      const all = htmlToText(block);
      const at = all.search(/(?:الراوي|المحدث|المصدر|خلاصة حكم المحدث)\s*[:：]/);
      if (at === -1) continue;
      textPart = all.slice(0, at);
      infoPart = all.slice(at);
    }
    const text = textPart.replace(/^\s*\d+\s*[-–]\s*/, "").trim();
    const info = parseInfo(infoPart);
    if (text.length < 8 || !info.grade) continue;
    out.push({
      text: clip(text, 1500),
      grade: clip(info.grade, 200),
      ...(info.rawi ? { rawi: clip(info.rawi, 120) } : {}),
      ...(info.muhaddith ? { muhaddith: clip(info.muhaddith, 120) } : {}),
      ...(info.book ? { book: clip(info.book, 160) } : {}),
      ...(info.page ? { page: clip(info.page, 60) } : {}),
      // علامة # برقم النتيجة: الرابط نفسه لكل نتائج البحث، فلا يحذفها التنظيف مكرراً.
      url: `${url}#${out.length + 1}`,
    });
  }
  return out;
}

/** HTML النتائج من رد الواجهة (ahadith.result)، أو أي نص فيه وسوم الأحاديث. */
export function dorarResultHtml(data: unknown): string {
  if (typeof data === "string") return data;
  if (!data || typeof data !== "object") return "";
  const o = data as Record<string, unknown>;
  const ahadith = o.ahadith as Record<string, unknown> | string | undefined;
  if (typeof ahadith === "string") return ahadith;
  if (ahadith && typeof ahadith.result === "string") return ahadith.result;
  if (typeof o.result === "string") return o.result;
  return "";
}
