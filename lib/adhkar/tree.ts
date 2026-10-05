import { classifyCategory } from "./rules";

/**
 * البحث في شجرة أبواب موسوعة الأحاديث عن بابي الأذكار (نقي: التصفح دالة تُمرَّر، فيُختبر محلياً).
 *
 * الأبواب الرئيسية لا تحمل كلمة «أذكار» (1 القرآن، 2 الحديث، 3 العقيدة، 4 الفقه وأصوله،
 * 5 الفضائل والآداب، 6 الدعوة والحسبة، 7 السيرة والتاريخ)، فالبحث في عناوينها وحدها لا يجد شيئاً.
 * لذلك نتصفح الأبواب الفرعية تكرارياً حتى عمق 3 تحت الرئيسية (browse_hadith_categories(category_id))،
 * والأقرب إلى الأذكار أولاً (الفضائل والآداب، والأذكار، والدعاء، والصلاة)، حتى نجد عنواناً فيه
 * «أذكار» مع «الصباح» أو «المساء» أو «بعد الصلاة» أو «أدبار الصلوات». ونحفظ الشجرة المتصفَّحة للعرض.
 */

export type AdhkarKind = "morningEvening" | "afterPrayer";

export type CategoryNode = {
  id: string;
  title: string;
  /** 0 للباب الرئيسي. */
  depth: number;
  parent?: string;
  /** باب أذكار مطابق. */
  kind?: AdhkarKind;
  /** تُصفّحت أبوابه الفرعية؟ وعددها. */
  browsed?: boolean;
  children?: number;
  error?: string;
};

export type FoundCategory = { id: string; title: string; kind: AdhkarKind };

/** الأبواب الرئيسية في الموسوعة (تُضاف إلى ما يعيده التصفح الأول إن نقص). */
export const MAIN_CATEGORIES: { id: string; title: string }[] = [
  { id: "1", title: "القرآن الكريم وعلومه" },
  { id: "2", title: "الحديث وعلومه" },
  { id: "3", title: "العقيدة" },
  { id: "4", title: "الفقه وأصوله" },
  { id: "5", title: "الفضائل والآداب" },
  { id: "6", title: "الدعوة والحسبة" },
  { id: "7", title: "السيرة والتاريخ" },
];

/** الأبواب الأقرب إلى الأذكار تُتصفح أولاً. */
const NEAR = /أذكار|الأذكار|الاذكار|ذكر|الدعاء|الأدعية|الادعية|دعاء|الفضائل|الآداب|الاداب|الصلاة|صلاة|الرقائق|اليوم والليلة|Remembrance|Dhikr|Adhkar|Supplication|Virtues|Manners|Prayer/i;

export type ExploreOptions = { maxDepth?: number; maxCalls?: number; concurrency?: number };

/**
 * يتصفح الشجرة «الأقرب أولاً» حتى عمق maxDepth تحت الرئيسية، ويتوقف إن وجد البابين أو بلغ maxCalls.
 * browse(id) يعيد الأبواب الفرعية المباشرة (أو يرمي)؛ والباب الذي لا فروع له ورقة.
 */
export async function exploreCategories(
  roots: { id: string; title: string }[],
  browse: (id: string) => Promise<{ id: string; title: string }[]>,
  { maxDepth = 3, maxCalls = 60, concurrency = 3 }: ExploreOptions = {},
): Promise<{ found: FoundCategory[]; tree: CategoryNode[]; calls: number }> {
  const tree: CategoryNode[] = [];
  const found = new Map<AdhkarKind, FoundCategory>();
  const seen = new Set<string>();
  let order = 0;
  type Item = { node: CategoryNode; near: boolean; order: number };
  const frontier: Item[] = [];

  const add = (c: { id: string; title: string }, depth: number, parent?: string) => {
    const id = String(c.id);
    if (seen.has(id)) return;
    seen.add(id);
    const kind = classifyCategory(c.title) ?? undefined;
    const node: CategoryNode = { id, title: c.title, depth, ...(parent ? { parent } : {}), ...(kind ? { kind } : {}) };
    tree.push(node);
    if (kind && !found.has(kind)) found.set(kind, { id, title: c.title, kind });
    // باب الأذكار المطابق لا يُتصفح (فروعه أحاديثه)؛ وما دون العمق الأقصى يدخل الطابور.
    if (!kind && depth < maxDepth) frontier.push({ node, near: NEAR.test(c.title), order: order++ });
  };

  roots.forEach((r) => add(r, 0));
  let calls = 0;
  while (frontier.length && found.size < 2 && calls < maxCalls) {
    // الأقرب إلى الأذكار، ثم الأقل عمقاً، ثم ترتيب الظهور.
    frontier.sort((a, b) => Number(b.near) - Number(a.near) || a.node.depth - b.node.depth || a.order - b.order);
    const batch = frontier.splice(0, Math.min(concurrency, maxCalls - calls));
    calls += batch.length;
    const results = await Promise.all(
      batch.map(async ({ node }) => {
        try {
          return { node, children: await browse(node.id) };
        } catch (error) {
          return { node, children: [], error: String((error as Error)?.message ?? error).slice(0, 160) };
        }
      }),
    );
    for (const { node, children, error } of results) {
      node.browsed = true;
      node.children = children.length;
      if (error) node.error = error;
      for (const child of children) add(child, node.depth + 1, node.id);
    }
  }
  return { found: [...found.values()], tree, calls };
}

/** الشجرة نصاً بمسافات العمق (للعرض في صفحة البناء). */
export function treeLines(tree: CategoryNode[]): string[] {
  const byParent = new Map<string | undefined, CategoryNode[]>();
  for (const n of tree) byParent.set(n.parent, [...(byParent.get(n.parent) ?? []), n]);
  const out: string[] = [];
  const walk = (parent: string | undefined) => {
    for (const n of byParent.get(parent) ?? []) {
      const mark = n.kind ? ` ← ${n.kind === "morningEvening" ? "أذكار الصباح والمساء" : "الأذكار بعد الصلاة"}` : "";
      const info = n.error ? ` (تعذّر: ${n.error})` : n.browsed ? ` [${n.children ?? 0}]` : "";
      out.push(`${"    ".repeat(n.depth)}• ${n.title} (${n.id})${info}${mark}`);
      walk(n.id);
    }
  };
  walk(undefined);
  return out;
}
