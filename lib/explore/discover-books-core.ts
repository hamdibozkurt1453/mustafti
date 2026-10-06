import { normalizeForSearch, type BookCard, type TreeNode } from "@/lib/library/islamhouse-core";

/**
 * F3: «كتب تجيب عن الأسئلة الكبرى» في /discover — دوال صرفة للاختبار.
 * المصدر تصنيف «التعريف بالإسلام» في شجرة IslamHouse، ثم ترتيب كتبه بكلمات الأسئلة الكبرى
 * (لماذا أنا مسلم، والوجود والإلحاد، ونبذة عن الإسلام، ومعنى الحياة…) بكل لغات الواجهة.
 */

export const DISCOVER_BOOKS_COUNT = 6;

/** أنماط عنوان التصنيف في الشجرة العربية، الأدق أولاً. */
export const INTRO_CATEGORY_MATCH = [/^التعريف بالإسلام$/, /التعريف بالإسلام/, /الدعوة إلى الإسلام|دعوة غير المسلمين/];

/** كلمات «الأسئلة الكبرى» (بعد التوحيد تطابق العنوان أو الوصف). */
export const BIG_QUESTION_KEYWORDS = [
  // ar / ur / fa
  "لماذا", "الالحاد", "الحاد", "وجود الله", "الخالق", "نبذه", "مبادئ الاسلام", "التعريف بالاسلام", "دين الحق", "الغايه", "معنى الحياه", "کیوں", "خدا", "چرا",
  // en / fr / id / ms / tr / ru / sw / ha / bn
  "why", "atheism", "existence", "god", "brief", "purpose", "meaning of life", "true religion", "pourquoi", "athéisme", "existence de dieu", "dieu",
  "mengapa", "kenapa", "ateis", "tuhan", "neden", "ateizm", "varlığı", "allah", "почему", "атеизм", "бог", "kwa nini", "mungu", "me yasa", "ubangiji", "কেন", "নাস্তিক",
];

/** أول عقدة في الشجرة يطابق عنوانها الأنماط بالترتيب (الأقرب إلى الجذر). */
export function findIntroCategory(tree: TreeNode[]): number | null {
  for (const p of INTRO_CATEGORY_MATCH) {
    const node = tree.filter((n) => p.test(n.title)).sort((a, b) => a.depth - b.depth)[0];
    if (node) return node.id;
  }
  return null;
}

/** درجة الكتاب: كلمة في العنوان 3، وفي الوصف 1. */
export function bigQuestionScore(book: BookCard): number {
  const title = ` ${normalizeForSearch(book.title)} `;
  const desc = ` ${normalizeForSearch(book.description)} `;
  let score = 0;
  for (const raw of BIG_QUESTION_KEYWORDS) {
    const k = normalizeForSearch(raw);
    if (!k) continue;
    if (title.includes(k)) score += 3;
    else if (desc.includes(k)) score += 1;
  }
  return score;
}

/**
 * يختار ستة كتب: كتب التصنيف بالدرجة (ثم ترتيبها الأصلي)، وإن نقصت فمن الاحتياط (أحدث الكتب)
 * ما له درجة فقط. بلا تكرار.
 */
export function pickDiscoverBooks(category: BookCard[], fallback: BookCard[], count = DISCOVER_BOOKS_COUNT): BookCard[] {
  const rank = (list: BookCard[]) =>
    list
      .map((book, i) => ({ book, i, score: bigQuestionScore(book) }))
      .sort((a, b) => b.score - a.score || a.i - b.i);
  const seen = new Set<number>();
  const out: BookCard[] = [];
  const take = (b: BookCard) => {
    if (out.length < count && !seen.has(b.id)) {
      seen.add(b.id);
      out.push(b);
    }
  };
  rank(category).forEach((x) => take(x.book));
  rank(fallback).filter((x) => x.score > 0).forEach((x) => take(x.book));
  return out;
}
