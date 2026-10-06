import "server-only";

import { apiBase, fetchJson, flattenTree, paths, toBookCards, type BookCard } from "@/lib/library/islamhouse-core";
import { findIntroCategory, pickDiscoverBooks } from "./discover-books-core";

/**
 * F3: كتب /discover من الواجهة البرمجية الرسمية لـ IslamHouse (بأدوات المكتبة من F1b، بلا تعديلها)،
 * بذاكرة الخادم 24 ساعة. أي خطأ يعيد قائمة فارغة فتعرض الصفحة رابط المكتبة بدلها.
 */

const DAY = 60 * 60 * 24;

function get(path: string): Promise<unknown> {
  return fetchJson(`${apiBase(process.env.ISLAMHOUSE_API_KEY)}${path}`, {
    init: { next: { revalidate: DAY, tags: ["islamhouse"] } } as RequestInit,
  });
}

export async function discoverBooks(lang: string): Promise<BookCard[]> {
  try {
    const [tree, latest] = await Promise.allSettled([get(paths.tree("ar")), get(paths.books(lang, 1, 50))]);
    const id = tree.status === "fulfilled" ? findIntroCategory(flattenTree(tree.value)) : null;
    let category: BookCard[] = [];
    if (id) {
      try {
        category = toBookCards(await get(paths.categoryItems(id, lang, 1, 50)), lang);
      } catch (error) {
        console.error(`discover books category ${id}:`, error instanceof Error ? error.message : error);
      }
    }
    const fallback = latest.status === "fulfilled" ? toBookCards(latest.value, lang) : [];
    return pickDiscoverBooks(category, fallback);
  } catch (error) {
    console.error("discover books:", error instanceof Error ? error.message : error);
    return [];
  }
}
