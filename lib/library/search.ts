import "server-only";

import { mcpSearch, mcpSearchAny } from "@/lib/sources/mcp-search";
import { libraryQueryPlan, toLibraryCards, type LibraryCard, type LibraryTopic } from "./items";

/**
 * البحث في مكتبة IslamHouse عبر خادم MCP: أداة search بـ sources=["library"]
 * (browse_library موقوف منذ R1e). النتائج مخزّنة 24 ساعة في lib/mcp.ts.
 *
 * F1: عنوان التصنيف وحده («الأسرة») كان يعيد «لم نجد مواد». صار البحث خطة من جولتين
 * (libraryQueryPlan): الجولة الأولى بلغة الواجهة بالعنوان وصيغة عربية وإنجليزية معاً، والثانية
 * احتياط بمرادفات بالعربية والإنجليزية، ثم بحث عام بلا تحديد مجموعة تُنتقى منه روابط IslamHouse.
 * تُدمج النتائج بلا تكرار، ونتائج لغة الواجهة أولاً. يعيد null إن تعذّر الخادم في كل المحاولات.
 */
const MAX_CARDS = 18;

async function round(queries: { q: string; lang: string }[]): Promise<{ cards: LibraryCard[]; failed: number }> {
  const settled = await Promise.allSettled(queries.map(({ q, lang }) => mcpSearch(q, lang, "library")));
  const cards: LibraryCard[] = [];
  let failed = 0;
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") cards.push(...toLibraryCards(r.value));
    else {
      failed += 1;
      console.error(`library search (${queries[i].lang}: ${queries[i].q}):`, r.reason instanceof Error ? r.reason.message : r.reason);
    }
  });
  return { cards, failed };
}

function merge(cards: LibraryCard[], locale: string): LibraryCard[] {
  const seen = new Set<string>();
  const unique = cards.filter((c) => !seen.has(c.url) && seen.add(c.url));
  // لغة الواجهة أولاً، ثم ما لا لغة له، ثم غيرها (ترتيب ثابت داخل كل فئة).
  const rank = (c: LibraryCard) => (c.lang === locale ? 0 : c.lang ? 2 : 1);
  return unique
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
    .map((x) => x.c)
    .slice(0, MAX_CARDS);
}

export async function searchLibrary(query: string, locale: string, topic: LibraryTopic | null = null): Promise<LibraryCard[] | null> {
  const [first, second] = libraryQueryPlan(query, locale, topic);
  let attempts = first.length;
  let failures = 0;

  const a = await round(first);
  failures += a.failed;
  let cards = a.cards;

  if (!cards.length && second.length) {
    const b = await round(second);
    attempts += second.length;
    failures += b.failed;
    cards = b.cards;
  }

  if (!cards.length) {
    // آخر احتياط: بحث عام (كل المجموعات) تُنتقى منه مواد islamhouse.com.
    attempts += 1;
    try {
      cards = toLibraryCards((await mcpSearchAny(query, locale)).filter((item) => item.corpus === "library"));
    } catch (error) {
      failures += 1;
      console.error("library search (any):", error instanceof Error ? error.message : error);
    }
  }

  if (!cards.length && failures === attempts) return null;
  return merge(cards, locale);
}
