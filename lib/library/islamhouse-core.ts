/**
 * F1b: مكتبة IslamHouse عبر واجهتها البرمجية الرسمية (api3.islamhouse.com/v3)، بدل البحث عبر MCP.
 * دوال صرفة للاختبار: تحويل الاستجابة إلى بطاقات، وتصنيفات الصفحة وربطها بشجرة التصنيفات،
 * والفلترة المحلية، والطلب بمهلة. الطلبات نفسها وذاكرتها في lib/library/islamhouse.ts.
 *
 * المسارات الموثّقة (القاعدة https://api3.islamhouse.com/v3/{key}/):
 *   الكتب بلغة:      main/books/{lang}/{lang}/{page}/{perPage}/json
 *   شجرة التصنيفات:  main/get-categories-tree/{lang}/json
 *   عناصر تصنيف:     main/get-category-items/{id}/showall/{lang}/showall/{page}/{perPage}/json
 *   تفاصيل عنصر:     main/get-item/{id}/{lang}/json
 * لا مسار بحث موثّقاً، فالبحث بالكلمة فلترة محلية لأحدث 200 كتاب بلغة الواجهة.
 */

/** المفتاح العام الموثّق في developers.islamhouse.com (ليس سراً، ويُستبدل بـ ISLAMHOUSE_API_KEY). */
export const ISLAMHOUSE_PUBLIC_KEY = "paV29H2gm56kvLPy";
export const ISLAMHOUSE_TIMEOUT_MS = 8_000;

export function apiBase(key: string | undefined = undefined): string {
  return `https://api3.islamhouse.com/v3/${encodeURIComponent((key ?? "").trim() || ISLAMHOUSE_PUBLIC_KEY)}`;
}

/** لغة الطلب: رمز من حرفين أو ثلاثة (لغات الواجهة)، وإلا العربية. */
export function apiLang(lang: string): string {
  return /^[a-z]{2,3}$/.test(lang) ? lang : "ar";
}

export const paths = {
  books: (lang: string, page: number, perPage: number) => `/main/books/${apiLang(lang)}/${apiLang(lang)}/${page}/${perPage}/json`,
  tree: (lang: string) => `/main/get-categories-tree/${apiLang(lang)}/json`,
  categoryItems: (id: number, lang: string, page: number, perPage: number) =>
    `/main/get-category-items/${id}/showall/${apiLang(lang)}/showall/${page}/${perPage}/json`,
  item: (id: number, lang: string) => `/main/get-item/${id}/${apiLang(lang)}/json`,
};

// ---------------------------------------------------------------------------
// الطلب بمهلة
// ---------------------------------------------------------------------------

export class IslamhouseError extends Error {
  constructor(
    message: string,
    readonly kind: "timeout" | "http" | "network" | "format",
  ) {
    super(message);
    this.name = "IslamhouseError";
  }
}

/**
 * طلب JSON بمهلة (8 ثوانٍ افتراضياً): بعدها يُلغى الطلب ويُرمى IslamhouseError("timeout")،
 * فلا تنتظر الصفحة طويلاً. init يمرَّر كما هو (ذاكرة Next في الخادم).
 */
export async function fetchJson(
  url: string,
  { timeoutMs = ISLAMHOUSE_TIMEOUT_MS, fetchImpl = fetch, init = {} }: { timeoutMs?: number; fetchImpl?: typeof fetch; init?: RequestInit } = {},
): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeoutError = () => new IslamhouseError(`islamhouse: timeout after ${timeoutMs}ms`, "timeout");
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(timeoutError());
      controller.abort();
    }, timeoutMs);
  });
  try {
    const res = await Promise.race([fetchImpl(url, { ...init, signal: controller.signal, headers: { accept: "application/json" } }), timeout]);
    if (!res.ok) throw new IslamhouseError(`islamhouse: HTTP ${res.status}`, "http");
    try {
      return await Promise.race([res.json(), timeout]);
    } catch (error) {
      if (error instanceof IslamhouseError) throw error;
      throw new IslamhouseError("islamhouse: invalid JSON", "format");
    }
  } catch (error) {
    if (timedOut) throw timeoutError();
    if (error instanceof IslamhouseError) throw error;
    throw new IslamhouseError(`islamhouse: ${error instanceof Error ? error.message : String(error)}`, "network");
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// تحويل الاستجابة إلى بطاقات
// ---------------------------------------------------------------------------

export type BookCard = {
  id: number;
  title: string;
  author: string | null;
  description: string;
  image: string | null;
  pdf: { url: string; size: string | null } | null;
  /** صفحة الكتاب في islamhouse.com بلغته. */
  pageUrl: string;
  lang: string;
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/** نص بلا وسوم HTML ولا كيانات شائعة، بمسافة واحدة. */
export function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function clipText(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trim()}…`;
}

/** رابط https فقط (الغلاف والملف)، ويُرقّى http إلى https لنطاقات IslamHouse. */
export function safeUrl(raw: unknown): string | null {
  const value = str(raw).trim();
  if (!value) return null;
  try {
    const u = new URL(value);
    if (u.protocol === "http:" && /(^|\.)islamhouse\.com$/.test(u.hostname)) u.protocol = "https:";
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** قائمة العناصر من الاستجابة: data[]، أو مصفوفة في الجذر، أو items[]. */
export function itemsOf(json: unknown): Obj[] {
  if (Array.isArray(json)) return json.filter(isObj);
  if (isObj(json)) {
    for (const key of ["data", "items", "result", "results"]) {
      const v = json[key];
      if (Array.isArray(v)) return v.filter(isObj);
      if (isObj(v) && Array.isArray(v.data)) return (v.data as unknown[]).filter(isObj);
    }
  }
  return [];
}

/** المؤلف من prepared_by[]: من نوعه «مؤلف» أولاً، وإلا الأول. حتى اسمين. */
function authorOf(item: Obj): string | null {
  const list = Array.isArray(item.prepared_by) ? item.prepared_by.filter(isObj) : [];
  const name = (p: Obj) => plainText(str(p.title ?? p.name));
  const authors = list.filter((p) => /author|مؤلف/i.test(str(p.kind ?? p.type ?? p.role)));
  const names = (authors.length ? authors : list).map(name).filter(Boolean);
  return names.length ? [...new Set(names)].slice(0, 2).join("، ") : null;
}

/** أول ملف PDF في attachments[] (بنوعه أو بامتداده). */
function pdfOf(item: Obj): BookCard["pdf"] {
  const list = Array.isArray(item.attachments) ? item.attachments.filter(isObj) : [];
  for (const a of list) {
    const url = safeUrl(a.url);
    if (!url) continue;
    const type = str(a.extension_type ?? a.extension ?? a.type).toLowerCase();
    if (type.includes("pdf") || /\.pdf(?:$|\?)/i.test(url)) {
      const size = str(a.size).trim();
      return { url, size: size || null };
    }
  }
  return null;
}

/** نوع العنصر إن ذكرته الاستجابة (books، articles…)، وإلا null. */
function typeOf(item: Obj): string | null {
  const t = str(item.type ?? item.item_type).toLowerCase().trim();
  return t || null;
}

/**
 * بطاقة كتاب من عنصر IslamHouse، أو null إن لم يكن كتاباً (type غير books) أو بلا معرّف أو عنوان.
 * الوصف نص بلا HTML حتى 220 حرفاً. الصفحة الرسمية: https://islamhouse.com/{lang}/books/{id}/
 */
export function toBookCard(item: unknown, lang: string): BookCard | null {
  if (!isObj(item)) return null;
  const type = typeOf(item);
  if (type && type !== "books" && type !== "book") return null;
  const id = Number(item.id);
  const title = plainText(str(item.title));
  if (!Number.isInteger(id) || id <= 0 || !title) return null;
  const image = safeUrl(item.image ?? item.thumbnail ?? item.cover);
  return {
    id,
    title,
    author: authorOf(item),
    description: clipText(plainText(str(item.description ?? item.full_description)), 220),
    image: image && !/no[-_]?image|default/i.test(image) ? image : null,
    pdf: pdfOf(item),
    pageUrl: `https://islamhouse.com/${apiLang(lang)}/books/${id}/`,
    lang: apiLang(lang),
  };
}

/** بطاقات الكتب من الاستجابة، بلا تكرار. */
export function toBookCards(json: unknown, lang: string): BookCard[] {
  const seen = new Set<number>();
  const out: BookCard[] = [];
  for (const item of itemsOf(json)) {
    const card = toBookCard(item, lang);
    if (card && !seen.has(card.id)) {
      seen.add(card.id);
      out.push(card);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// الفلترة المحلية
// ---------------------------------------------------------------------------

/** توحيد للمطابقة: بلا تشكيل ولا تطويل، والهمزات ألفاً، والتاء المربوطة هاءً، والياء، وحروف صغيرة. */
export function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ًͯ-ٰٟۖ-ۭـ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ىی]/g, "ي")
    .replace(/ک/g, "ك")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** كلمات البحث بعد التوحيد، بلا «ال» في أولها، وبلا الكلمات القصيرة جداً. */
function terms(query: string): string[] {
  return normalizeForSearch(query)
    .split(" ")
    .map((w) => (w.length > 4 && w.startsWith("ال") ? w.slice(2) : w))
    .filter((w) => w.length >= 2);
}

/**
 * يفلتر الكتب بالعنوان والمؤلف والوصف: كل كلمة من البحث يجب أن تظهر. ترتيب: مطابقة العنوان أولاً.
 */
export function filterBooks(books: BookCard[], query: string): BookCard[] {
  const words = terms(query);
  if (!words.length) return [];
  const scored: { book: BookCard; score: number; i: number }[] = [];
  books.forEach((book, i) => {
    const title = normalizeForSearch(book.title);
    const rest = normalizeForSearch(`${book.author ?? ""} ${book.description}`);
    let score = 0;
    for (const w of words) {
      if (title.includes(w)) score += 3;
      else if (rest.includes(w)) score += 1;
      else return;
    }
    scored.push({ book, score, i });
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map((s) => s.book);
}

// ---------------------------------------------------------------------------
// التصنيفات
// ---------------------------------------------------------------------------

/**
 * تصنيفات الصفحة (العشرة). id: معرّف مؤكَّد من شجرة IslamHouse. match: أنماط عنوان التصنيف في الشجرة
 * العربية لما لم يُؤكَّد معرّفه (يُبحث عنه عند الطلب). keywords: احتياط إن لم يوجد التصنيف في الشجرة:
 * فلترة محلية لأحدث الكتب بهذه الكلمات.
 */
export const LIBRARY_TOPIC_KEYS = ["aqeedah", "prayer", "fasting", "seerah", "newMuslim", "family", "tafsir", "hadith", "akhlaq", "dawah"] as const;
export type LibraryTopicKey = (typeof LIBRARY_TOPIC_KEYS)[number];

export function isTopicKey(value: string): value is LibraryTopicKey {
  return (LIBRARY_TOPIC_KEYS as readonly string[]).includes(value);
}

export type TopicDef = { key: LibraryTopicKey; id?: number; match: RegExp[]; keywords: string[] };

export const LIBRARY_TOPIC_DEFS: TopicDef[] = [
  { key: "aqeedah", id: 192525, match: [/^العقيدة$/], keywords: ["العقيدة", "التوحيد", "الإيمان"] },
  { key: "prayer", match: [/^الصلاة$/, /^صلاة/, /الصلاة/], keywords: ["الصلاة", "صلاة"] },
  { key: "fasting", match: [/^الصيام$/, /^الصوم$/, /الصيام|الصوم/], keywords: ["الصيام", "الصوم", "رمضان"] },
  { key: "seerah", match: [/^السيرة النبوية$/, /السيرة/], keywords: ["السيرة", "سيرة النبي", "الرسول"] },
  {
    key: "newMuslim",
    match: [/المسلم الجديد|المسلمين الجدد|المهتدين|حديثي العهد|الداخلين في الإسلام/],
    keywords: ["المسلم الجديد", "المهتدي", "مبادئ الإسلام"],
  },
  { key: "family", match: [/^الأسرة/, /الأسرة|الزواج|النكاح/], keywords: ["الأسرة", "الزواج", "الزوجين"] },
  { key: "tafsir", id: 728011, match: [/^التفسير$/], keywords: ["تفسير"] },
  { key: "hadith", id: 132381, match: [/^السنة$/, /الحديث/], keywords: ["الحديث", "السنة", "الأربعين"] },
  { key: "akhlaq", match: [/^الأخلاق/, /الأخلاق|الآداب/], keywords: ["الأخلاق", "الآداب"] },
  { key: "dawah", match: [/^الدعوة/, /الدعوة/], keywords: ["الدعوة", "الداعية"] },
];


export type TreeNode = { id: number; title: string; depth: number };

/** عُقد شجرة التصنيفات مسطّحة (id والعنوان والعمق)، أياً كان اسم حقل الفروع. */
export function flattenTree(json: unknown): TreeNode[] {
  const out: TreeNode[] = [];
  const visit = (node: unknown, depth: number) => {
    if (depth > 8) return;
    if (Array.isArray(node)) return node.forEach((n) => visit(n, depth));
    if (!isObj(node)) return;
    const id = Number(node.id ?? node.category_id);
    const title = plainText(str(node.title ?? node.name ?? node.block_name));
    const isNode = Number.isInteger(id) && id > 0 && Boolean(title);
    if (isNode) out.push({ id, title, depth });
    for (const [key, value] of Object.entries(node)) {
      if (value && typeof value === "object" && /^(data|children|sub|subs|subcategories|sub_categories|childs|items|categories)$/i.test(key)) {
        // الغلاف ({data: [...]}) ليس مستوى في الشجرة.
        visit(value, isNode ? depth + 1 : depth);
      }
    }
  };
  visit(json, 0);
  return out;
}

/**
 * معرّف التصنيف لكل موضوع: المؤكَّد أولاً، وإلا أول عقدة في الشجرة يطابق عنوانها أنماطه بالترتيب
 * (النمط الأدق أولاً، ثم الأقرب إلى الجذر). null: لا تصنيف مطابق (فيُستعمل احتياط الكلمات).
 */
export function resolveTopicIds(tree: TreeNode[], defs: TopicDef[] = LIBRARY_TOPIC_DEFS): Partial<Record<LibraryTopicKey, number | null>> {
  const out: Partial<Record<LibraryTopicKey, number | null>> = {};
  for (const def of defs) {
    if (def.id) {
      out[def.key] = def.id;
      continue;
    }
    let found: TreeNode | undefined;
    for (const pattern of def.match) {
      found = tree.filter((n) => pattern.test(n.title)).sort((a, b) => a.depth - b.depth)[0];
      if (found) break;
    }
    out[def.key] = found?.id ?? null;
  }
  return out;
}

// ---------------------------------------------------------------------------
// F2: الترقيم — 6 كتب في البداية، و«اكتشف المزيد» يضيف 6 في كل ضغطة
// ---------------------------------------------------------------------------

export const LIBRARY_PAGE_SIZE = 6;
/** حد الصفحات في الطلب الواحد (6 كتب في الصفحة، فحتى 50 ضغطة). */
export const LIBRARY_MAX_PAGE = 50;

/** رقم الصفحة من المدخل: عدد صحيح بين 1 و50، وإلا 1. */
export function parsePage(raw: unknown): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= LIBRARY_MAX_PAGE ? n : 1;
}

export type BookPage = { books: BookCard[]; hasMore: boolean; page: number };

/** صفحة من قائمة جاهزة (البحث المحلي واحتياط التصنيف). */
export function pageSlice(list: BookCard[], page: number, size = LIBRARY_PAGE_SIZE): BookPage {
  const start = (page - 1) * size;
  return { books: list.slice(start, start + size), hasMore: list.length > start + size, page };
}

/**
 * صفحة من مصدر بصفحات الواجهة البرمجية (perPage عنصراً في كل طلب، مخزّنة 24 ساعة): تُجمع الكتب من
 * صفحات المصدر بالترتيب حتى يكفي ما قبل الصفحة المطلوبة وما بعدها بكتاب (لمعرفة «المزيد»)، أو ينفد المصدر
 * (صفحة أقل من perPage عنصراً). العناصر غير الكتب تُترك، فعدد الكتب في صفحة المصدر قد يقل عن perPage.
 */
export async function collectPage(
  fetchPage: (sourcePage: number) => Promise<unknown>,
  lang: string,
  page: number,
  { size = LIBRARY_PAGE_SIZE, perPage = 50, maxSourcePages = 8 }: { size?: number; perPage?: number; maxSourcePages?: number } = {},
): Promise<BookPage> {
  const need = page * size + 1;
  const seen = new Set<number>();
  const books: BookCard[] = [];
  for (let p = 1; p <= maxSourcePages && books.length < need; p++) {
    const json = await fetchPage(p);
    for (const b of toBookCards(json, lang)) if (!seen.has(b.id) && seen.add(b.id)) books.push(b);
    if (itemsOf(json).length < perPage) break;
  }
  return pageSlice(books, page, size);
}
