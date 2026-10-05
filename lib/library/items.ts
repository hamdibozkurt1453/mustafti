/**
 * «المكتبة» (R2): مواد IslamHouse المجانية عبر بحث خادم MCP (sources=["library"]).
 * دوال صرفة للعرض والاختبار: لا ننسخ أي ملف ولا نستضيفه، وكل بطاقة ترجع إلى رابطها الرسمي.
 */

/** اقتراحات التصنيفات الجاهزة (عنوانها بلغة الواجهة في messages تحت library.topics، وهو نص البحث). */
export const LIBRARY_TOPICS = ["aqeedah", "prayer", "fasting", "seerah", "newMuslim", "family"] as const;
export type LibraryTopic = (typeof LIBRARY_TOPICS)[number];

/** أنواع المواد كما تظهر في روابط islamhouse.com/{lang}/{type}/{id}/ */
export const LIBRARY_TYPES = ["books", "articles", "audios", "videos", "fatwa", "posters", "other"] as const;
export type LibraryType = (typeof LIBRARY_TYPES)[number];

export type LibraryCard = { title: string; url: string; type: LibraryType; lang: string | null; text: string };

const MAX_QUERY = 120;

/** نص بحث نظيف (مسافة واحدة، وحد أعلى للطول)، أو "" إن كان فارغاً. */
export function cleanQuery(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY) : "";
}

/** هل الرابط مادة على islamhouse.com نفسها (https)؟ لا نعرض غيره في المكتبة. */
export function isIslamhouseUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "islamhouse.com" || u.hostname.endsWith(".islamhouse.com"));
  } catch {
    return false;
  }
}

/** نوع المادة ولغتها من رابطها الرسمي (islamhouse.com/ar/books/123/). */
export function libraryMeta(url: string, lang?: string | null): { type: LibraryType; lang: string | null } {
  let segments: string[] = [];
  try {
    segments = new URL(url).pathname.split("/").filter(Boolean);
  } catch {
    /* رابط غير صالح */
  }
  const [first, second] = segments;
  const urlLang = first && /^[a-z]{2,3}$/i.test(first) ? first.toLowerCase() : null;
  const raw = (urlLang ? second : first)?.toLowerCase() ?? "";
  const type = (LIBRARY_TYPES as readonly string[]).includes(raw) ? (raw as LibraryType) : "other";
  const declared = lang && /^[a-z]{2,3}$/i.test(lang.trim()) ? lang.trim().toLowerCase() : null;
  return { type, lang: declared ?? urlLang };
}

/** بطاقات المكتبة من نتائج البحث: روابط IslamHouse فقط، بلا تكرار. */
export function toLibraryCards(items: { title: string; text: string; url: string; lang?: string }[]): LibraryCard[] {
  const seen = new Set<string>();
  const out: LibraryCard[] = [];
  for (const item of items) {
    if (!isIslamhouseUrl(item.url) || seen.has(item.url)) continue;
    seen.add(item.url);
    out.push({ title: item.title || item.text, text: item.text, url: item.url, ...libraryMeta(item.url, item.lang) });
  }
  return out;
}

/** رابط البحث في المكتبة الشاملة (رابط فقط، يُفتح في تبويب جديد). */
export function shamelaSearchUrl(query: string): string {
  return `https://shamela.ws/search?q=${encodeURIComponent(query)}`;
}
