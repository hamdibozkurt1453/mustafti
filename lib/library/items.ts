/**
 * «المكتبة» (R2): مواد IslamHouse المجانية عبر بحث خادم MCP (sources=["library"]).
 * دوال صرفة للعرض والاختبار: لا ننسخ أي ملف ولا نستضيفه، وكل بطاقة ترجع إلى رابطها الرسمي.
 */

/** اقتراحات التصنيفات الجاهزة (عنوانها بلغة الواجهة في messages تحت library.topics، وهو نص البحث). */
export const LIBRARY_TOPICS = ["aqeedah", "prayer", "fasting", "seerah", "newMuslim", "family"] as const;
export type LibraryTopic = (typeof LIBRARY_TOPICS)[number];

/**
 * F1: كلمات بحث كل تصنيف، لأن عنوان التصنيف وحده («الأسرة») قد لا يطابق شيئاً في بحث المكتبة:
 * صيغ عربية (بلا «ال» ومرادفات) وإنجليزية معاً، فيكفي أن يطابق أحدها. العنوان بلغة الواجهة يُبحث أولاً.
 */
export const TOPIC_TERMS: Record<LibraryTopic, { ar: string[]; en: string[] }> = {
  aqeedah: { ar: ["العقيدة", "التوحيد", "أركان الإيمان"], en: ["Islamic creed", "Tawheed"] },
  prayer: { ar: ["الصلاة", "صفة الصلاة", "أحكام الصلاة"], en: ["prayer", "how to pray"] },
  fasting: { ar: ["الصيام", "صيام رمضان", "أحكام الصيام"], en: ["fasting", "Ramadan"] },
  seerah: { ar: ["السيرة النبوية", "سيرة النبي", "محمد رسول الله"], en: ["Prophet Muhammad biography", "seerah"] },
  newMuslim: { ar: ["المسلم الجديد", "المهتدي الجديد", "مبادئ الإسلام"], en: ["new Muslim", "new Muslim guide"] },
  family: { ar: ["الأسرة", "الزواج", "حقوق الزوجين", "تربية الأبناء"], en: ["family in Islam", "marriage"] },
};

/** التصنيف الذي عنوانه بلغة الواجهة هو نص البحث (روابط التصنيفات ?q=العنوان)، أو null. */
export function topicForQuery(q: string, labels: Record<LibraryTopic, string>): LibraryTopic | null {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  return LIBRARY_TOPICS.find((t) => norm(labels[t]) === norm(q)) ?? null;
}

/**
 * F1: عبارات البحث بالترتيب، على جولتين: الأولى بلغة الواجهة (العنوان، ثم أول صيغة عربية، ثم الإنجليزية)،
 * والثانية احتياط إن لم تأتِ الأولى بشيء (بقية الصيغ العربية بالعربية، والإنجليزية بالإنجليزية).
 * لبحث حر بلا تصنيف: العبارة نفسها بلغة الواجهة، ثم بالعربية والإنجليزية.
 */
export function libraryQueryPlan(q: string, locale: string, topic: LibraryTopic | null): { q: string; lang: string }[][] {
  const uniq = (list: { q: string; lang: string }[]) => {
    const seen = new Set<string>();
    return list.filter((x) => x.q && !seen.has(`${x.lang}|${x.q}`) && seen.add(`${x.lang}|${x.q}`));
  };
  if (!topic) {
    return [uniq([{ q, lang: locale }]), uniq([{ q, lang: "ar" }, { q, lang: "en" }].filter((x) => x.lang !== locale))];
  }
  const { ar, en } = TOPIC_TERMS[topic];
  const first = uniq([{ q, lang: locale }, { q: ar[0], lang: locale }, { q: en[0], lang: locale }]);
  const seen = new Set(first.map((x) => `${x.lang}|${x.q}`));
  const second = uniq([...ar.slice(1).map((t) => ({ q: t, lang: "ar" })), ...en.map((t) => ({ q: t, lang: "en" })), { q: ar[0], lang: "ar" }])
    .filter((x) => !seen.has(`${x.lang}|${x.q}`))
    .slice(0, 4);
  return [first, second];
}

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
