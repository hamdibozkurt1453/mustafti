import "server-only";

import {
  apiBase,
  collectPage,
  fetchJson,
  filterBooks,
  flattenTree,
  LIBRARY_TOPIC_DEFS,
  pageSlice,
  paths,
  resolveTopicIds,
  toBookCards,
  type BookCard,
  type BookPage,
  type LibraryTopicKey,
} from "./islamhouse-core";

/**
 * F1b: طلبات مكتبة IslamHouse (الواجهة البرمجية الرسمية) بذاكرة الخادم 24 ساعة:
 * ذاكرة fetch في Next (revalidate) فتُشارك بين الطلبات والنسخ، والكتب لا تتغير.
 * كل طلب بمهلة 8 ثوانٍ (fetchJson). الأخطاء تصعد إلى الصفحة فتعرض رسالة واضحة.
 */

const DAY = 60 * 60 * 24;
/** حد البحث المحلي: أحدث 200 كتاب بلغة الواجهة (4 صفحات × 50). */
const SEARCH_PAGES = 4;
const SEARCH_PER_PAGE = 50;

function get(path: string): Promise<unknown> {
  return fetchJson(`${apiBase(process.env.ISLAMHOUSE_API_KEY)}${path}`, {
    init: { next: { revalidate: DAY, tags: ["islamhouse"] } } as RequestInit,
  });
}

/** F2: أحدث الكتب بلغة، 6 في كل صفحة (من صفحات الواجهة البرمجية بخمسين، المخزّنة 24 ساعة). */
export async function latestBooks(lang: string, page = 1): Promise<BookPage> {
  return collectPage((p) => get(paths.books(lang, p, SEARCH_PER_PAGE)), lang, page);
}

/** أحدث 200 كتاب بلغة، للبحث المحلي. صفحة فشلت لا تُسقط الباقي، إلا إن فشلت كلها. */
async function searchPool(lang: string): Promise<BookCard[]> {
  const pages = await Promise.allSettled(
    Array.from({ length: SEARCH_PAGES }, (_, i) => get(paths.books(lang, i + 1, SEARCH_PER_PAGE))),
  );
  const ok = pages.filter((p): p is PromiseFulfilledResult<unknown> => p.status === "fulfilled");
  if (!ok.length) throw (pages[0] as PromiseRejectedResult).reason;
  const seen = new Set<number>();
  return ok.flatMap((p) => toBookCards(p.value, lang)).filter((b) => !seen.has(b.id) && seen.add(b.id));
}

/** البحث بالكلمة: لا مسار بحث موثّقاً في الواجهة البرمجية، ففلترة محلية بالعنوان والمؤلف والوصف. 6 في كل صفحة. */
export async function searchBooks(query: string, lang: string, page = 1): Promise<BookPage> {
  return pageSlice(filterBooks(await searchPool(lang), query), page);
}

/** معرّفات تصنيفات الصفحة من شجرة التصنيفات العربية (العناوين العربية ثابتة، والمعرّف واحد لكل اللغات). */
async function topicIds(): Promise<Partial<Record<LibraryTopicKey, number | null>>> {
  try {
    return resolveTopicIds(flattenTree(await get(paths.tree("ar"))));
  } catch (error) {
    console.error("islamhouse tree:", error instanceof Error ? error.message : error);
    return resolveTopicIds([]);
  }
}

/**
 * كتب تصنيف، 6 في كل صفحة: عناصر التصنيف من الواجهة البرمجية (الكتب وحدها)، وإن لم يوجد التصنيف في الشجرة
 * أو لم يكن فيه كتب بهذه اللغة، فكلمات التصنيف على أحدث 200 كتاب.
 */
export async function topicBooks(key: LibraryTopicKey, lang: string, page = 1): Promise<BookPage> {
  const def = LIBRARY_TOPIC_DEFS.find((t) => t.key === key);
  if (!def) return { books: [], hasMore: false, page };
  const id = (await topicIds())[key];
  if (id) {
    try {
      const source = (p: number) => get(paths.categoryItems(id, lang, p, SEARCH_PER_PAGE));
      const result = await collectPage(source, lang, page);
      // التصنيف فيه كتب بهذه اللغة؟ (الصفحة الأولى مخزّنة، فالسؤال رخيص.)
      const first = page === 1 ? result : await collectPage(source, lang, 1);
      if (first.books.length) return result;
    } catch (error) {
      console.error(`islamhouse category ${id}:`, error instanceof Error ? error.message : error);
    }
  }
  const pool = await searchPool(lang);
  const seen = new Set<number>();
  const books: BookCard[] = def.keywords.flatMap((k) => filterBooks(pool, k)).filter((b) => !seen.has(b.id) && seen.add(b.id));
  return pageSlice(books, page);
}
