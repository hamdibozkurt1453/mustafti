import "server-only";

import { locales } from "@/i18n/locales";
import { callTool, listTools, toolData, toolText, type McpTool } from "@/lib/mcp";
import { cleanToolText } from "@/lib/brain/rank";
import { clip, htmlToText } from "@/lib/sources/html";
import {
  classifyCategory,
  hadeethencUrl,
  isAcceptedGrade,
  morningEvening,
  repeatCount,
  type DhikrRow,
  type Occasion,
} from "./rules";

/**
 * بناء الأذكار من موسوعة الأحاديث عبر خادم MCP الرسمي فقط (browse_hadith_categories ثم get_hadith).
 * لا نص مولّد: كل حقل منقول من رد الخادم كما هو (بعد تنظيف وسوم Markdown وتعليمات الخادم للنموذج).
 * مخطط كل أداة يُقرأ من الخادم (أسماء الحقول غير مفترضة)، والرد يُقرأ بمرونة (JSON أو نص).
 *
 * العربية أولاً: هي التي تقرّر الإدراج (الدرجة صحيح أو حسن)، والوقت، والعدد. ثم كل لغة واجهة أخرى
 * تُجلب للأحاديث المقبولة نفسها، وما لا ترجمة له في الموسوعة يسقط بصمت.
 */

export type CategoryRef = { id: string; title: string; kind: "morningEvening" | "afterPrayer" };
export type HadithRef = { id: string; title: string; kind: CategoryRef["kind"] };
export type HadithDoc = { id: string; title?: string; text?: string; explanation?: string; grade?: string; url?: string };

const TIMEOUT = 20_000;
const NO_CACHE = { timeoutMs: TIMEOUT, cacheTtlMs: 0 };

async function tool(name: string): Promise<McpTool> {
  const t = (await listTools()).find((x) => x.name === name);
  if (!t) throw new Error(`MCP tool \`${name}\` not found`);
  return t;
}

const props = (t: McpTool) => t.inputSchema.properties ?? {};
const keyOf = (t: McpTool, re: RegExp) => Object.keys(props(t)).find((k) => re.test(k));

function langArg(t: McpTool, lang: string): Record<string, unknown> {
  const k = keyOf(t, /^(language|lang|locale|language_code)$/i);
  if (!k) return {};
  const allowed = props(t)[k]?.enum;
  return !allowed || allowed.includes(lang) ? { [k]: lang } : {};
}

function idArg(t: McpTool, re: RegExp, id: string): Record<string, unknown> {
  const k = keyOf(t, re) ?? keyOf(t, /id$/i) ?? t.inputSchema.required?.[0];
  if (!k) return {};
  const numeric = props(t)[k]?.type === "integer" || props(t)[k]?.type === "number";
  return { [k]: numeric ? Number(id) : id };
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined);

function pick(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of Object.keys(o)) if (keys.includes(k.toLowerCase())) {
    const v = str(o[k]);
    if (v) return v;
  }
  return undefined;
}

/** كل كائن فيه معرّف وعنوان، في أي عمق من الرد. */
function nodes(data: unknown, depth = 0, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (depth > 7 || !data || typeof data !== "object") return out;
  if (Array.isArray(data)) {
    data.forEach((d) => nodes(d, depth + 1, out));
    return out;
  }
  const o = data as Record<string, unknown>;
  if (pick(o, ["id", "category_id", "hadith_id", "hadeeth_id"]) && pick(o, ["title", "name", "category", "category_name"])) out.push(o);
  for (const v of Object.values(o)) if (v && typeof v === "object") nodes(v, depth + 1, out);
  return out;
}

const isCategoryNode = (o: Record<string, unknown>) =>
  Object.keys(o).some((k) => /hadeeths_count|hadiths_count|parent_id|subcategories|children|category_id/i.test(k));

/** أسطر نصية «123 — عنوان» أو «ID: 123» حين لا يعيد الخادم JSON. */
function nodesFromText(text: string): { id: string; title: string }[] {
  const out: { id: string; title: string }[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/(?:\bid\b\s*[:=]?\s*|\[|#|^\s*[-*]?\s*)(\d{2,7})\]?\s*[-–—:|.)]\s*(.{3,200})/i);
    if (m) out.push({ id: m[1], title: m[2].replace(/[*_`#]/g, "").trim() });
  }
  return out;
}

async function browse(args: Record<string, unknown>) {
  const t = await tool("browse_hadith_categories");
  const result = await callTool(t.name, args, NO_CACHE);
  return { data: toolData(result), text: toolText(result) };
}

/** يجد بابي «أذكار الصباح والمساء» و«الأذكار بعد الصلاة» بالعربية، نازلاً في أبواب الأذكار حتى 3 مستويات. */
export async function findCategories(): Promise<CategoryRef[]> {
  const t = await tool("browse_hadith_categories");
  const found = new Map<string, CategoryRef>();
  const seen = new Set<string>();
  let frontier: { args: Record<string, unknown> }[] = [{ args: { ...langArg(t, "ar") } }];
  for (let level = 0; level < 3 && frontier.length; level++) {
    const next: typeof frontier = [];
    for (const f of frontier.slice(0, 8)) {
      const { data, text } = await browse(f.args);
      const list = nodes(data).map((o) => ({ id: pick(o, ["id", "category_id"])!, title: pick(o, ["title", "name", "category", "category_name"])! }));
      for (const c of list.length ? list : nodesFromText(text)) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        const kind = classifyCategory(c.title);
        if (kind) found.set(c.id, { id: c.id, title: c.title, kind });
        // أبواب الأذكار والأدعية: ننزل فيها بحثاً عن البابين.
        else if (/الأذكار|الاذكار|الذكر|الدعاء|الأدعية|الادعيه|الفضائل|Remembrance|Dhikr|Supplication/i.test(c.title))
          next.push({ args: { ...langArg(t, "ar"), ...idArg(t, /^(category_id|category|id|parent_id)$/i, c.id) } });
      }
    }
    if (found.size >= 2) break;
    frontier = next;
  }
  return [...found.values()];
}

/** أحاديث باب واحد (بكل صفحاته، حتى 10 صفحات). */
export async function listCategory(cat: CategoryRef): Promise<HadithRef[]> {
  const t = await tool("browse_hadith_categories");
  const pageKey = keyOf(t, /^(page|page_number)$/i);
  const out = new Map<string, HadithRef>();
  for (let page = 1; page <= (pageKey ? 10 : 1); page++) {
    const args = {
      ...langArg(t, "ar"),
      ...idArg(t, /^(category_id|category|id)$/i, cat.id),
      ...(pageKey ? { [pageKey]: page } : {}),
    };
    const { data, text } = await browse(args);
    const before = out.size;
    const list = nodes(data).filter((o) => !isCategoryNode(o));
    const items = list.length
      ? list.map((o) => ({ id: pick(o, ["hadith_id", "hadeeth_id", "id"])!, title: pick(o, ["title", "name"])! }))
      : nodesFromText(text);
    for (const h of items) if (h.id !== cat.id && !out.has(h.id)) out.set(h.id, { ...h, kind: cat.kind });
    if (out.size === before) break;
  }
  return [...out.values()];
}

type Segment = { kind?: string; label?: string; text?: string };

/** نص الحديث وشرحه ودرجته ورابطه بلغة واحدة (get_hadith). null إن لم يوجد بهذه اللغة. */
export async function getHadith(id: string, lang: string): Promise<HadithDoc | null> {
  const t = await tool("get_hadith");
  const result = await callTool(t.name, { ...idArg(t, /^(id|hadith_id|hadeeth_id)$/i, id), ...langArg(t, lang) }, NO_CACHE);
  const data = toolData(result);
  const raw = toolText(result);
  const doc: HadithDoc = { id };
  const visit = (node: unknown, depth: number) => {
    if (depth > 6 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach((n) => visit(n, depth + 1));
    const o = node as Record<string, unknown>;
    doc.title ??= pick(o, ["title"]);
    doc.text ??= pick(o, ["hadeeth", "hadith", "hadith_text", "hadeeth_text", "text", "content"]);
    doc.explanation ??= pick(o, ["explanation", "sharh", "explanation_text", "commentary"]);
    doc.grade ??= pick(o, ["grade", "hadith_grade", "hadeeth_grade", "hukm", "degree", "authenticity"]);
    doc.url ??= pick(o, ["url", "link", "permalink", "source_url"]);
    const segs = Array.isArray(o.segments) ? (o.segments as Segment[]) : [];
    for (const s of segs) {
      const label = `${s.kind ?? ""} ${s.label ?? ""}`;
      if (!s.text?.trim()) continue;
      if (/grade|درجة|الحكم/i.test(label)) doc.grade ??= s.text.trim();
      else if (/explanation|شرح|المعنى/i.test(label)) doc.explanation ??= s.text.trim();
      else if (/hadith|hadeeth|text|الحديث|النص/i.test(label)) doc.text ??= s.text.trim();
    }
    for (const v of Object.values(o)) if (v && typeof v === "object") visit(v, depth + 1);
  };
  visit(data, 0);
  // رد نصي: الدرجة من سطرها، والحديث ما قبل الشرح.
  if (!doc.grade) doc.grade = raw.match(/(?:الدرجة|درجة الحديث|الحكم|Grade|Degree)\s*[*_]*\s*[:：]\s*[*_]*\s*([^\n]+)/i)?.[1];
  if (!doc.text && raw.trim()) {
    const cleaned = cleanToolText(raw);
    doc.text = cleaned.split(/\n\s*(?:الشرح|Explanation)\s*[:：]?/i)[0];
    doc.explanation ??= cleaned.split(/\n\s*(?:الشرح|Explanation)\s*[:：]?/i)[1];
  }
  const tidy = (s: string | undefined, max: number) => (s ? clip(htmlToText(cleanToolText(s)), max) : undefined);
  const text = tidy(doc.text, 3000);
  if (!text || text.length < 10) return null;
  return {
    id,
    title: tidy(doc.title, 300),
    text,
    explanation: tidy(doc.explanation, 4000),
    grade: tidy(doc.grade?.replace(/[*_]+/g, ""), 200),
    url: doc.url && /^https:\/\/(?:www\.)?hadeethenc\.com\//.test(doc.url) ? doc.url : hadeethencUrl(id, lang),
  };
}

export type BuildReport = {
  lang: string;
  categories: CategoryRef[];
  listed: number;
  saved: number;
  skippedNoGrade: { id: string; title?: string; grade?: string }[];
  missing: string[];
  rows: DhikrRow[];
};

/**
 * العربية: يجد البابين، ويجلب كل حديث، ويقبل ما درجته صحيح أو حسن فقط.
 * categoriesOverride: معرّفات أبواب يدوية من صفحة البناء إن لم يجدها البحث بالعنوان.
 */
export async function buildArabic(categoriesOverride?: CategoryRef[]): Promise<BuildReport> {
  const categories = categoriesOverride?.length ? categoriesOverride : await findCategories();
  if (!categories.length) throw new Error("لم يُعثر على بابي الأذكار في browse_hadith_categories (استعمل «الفحص»).");
  const refs: HadithRef[] = [];
  for (const c of categories) for (const h of await listCategory(c)) if (!refs.some((r) => r.id === h.id)) refs.push(h);
  const report: BuildReport = { lang: "ar", categories, listed: refs.length, saved: 0, skippedNoGrade: [], missing: [], rows: [] };
  let position = 0;
  // بالتوازي (عميل MCP يحدّ التزامن بـ 3 طلبات)، والترتيب ترتيب الباب.
  const docs = await Promise.all(refs.map((ref) => getHadith(ref.id, "ar").catch(() => null)));
  for (const [i, ref] of refs.entries()) {
    const doc = docs[i];
    if (!doc?.text) {
      report.missing.push(ref.id);
      continue;
    }
    if (!isAcceptedGrade(doc.grade)) {
      report.skippedNoGrade.push({ id: ref.id, title: doc.title ?? ref.title, grade: doc.grade });
      continue;
    }
    const occasions: Occasion[] = ref.kind === "afterPrayer" ? ["after_prayer"] : morningEvening(doc.text);
    report.rows.push({
      hadith_id: ref.id,
      lang: "ar",
      occasions,
      position: position++,
      title: doc.title ?? ref.title ?? null,
      text: doc.text,
      explanation: doc.explanation ?? null,
      grade: doc.grade!,
      repeat_count: repeatCount(doc.text),
      source_url: doc.url ?? hadeethencUrl(ref.id, "ar"),
    });
  }
  report.saved = report.rows.length;
  return report;
}

/** لغة واجهة أخرى: الأحاديث المقبولة بالعربية نفسها (الوقت والعدد والترتيب من الصف العربي). */
export async function buildTranslation(lang: string, arabic: DhikrRow[]): Promise<BuildReport> {
  const report: BuildReport = { lang, categories: [], listed: arabic.length, saved: 0, skippedNoGrade: [], missing: [], rows: [] };
  const docs = await Promise.all(arabic.map((ar) => getHadith(ar.hadith_id, lang).catch(() => null)));
  for (const [i, ar] of arabic.entries()) {
    const doc = docs[i];
    // الموسوعة تعيد العربية أحياناً حين لا ترجمة: لا نحفظها ترجمةً.
    if (!doc?.text || doc.text === ar.text) {
      report.missing.push(ar.hadith_id);
      continue;
    }
    report.rows.push({
      ...ar,
      lang,
      title: doc.title ?? null,
      text: doc.text,
      explanation: doc.explanation ?? null,
      grade: doc.grade ?? ar.grade,
      source_url: doc.url ?? hadeethencUrl(ar.hadith_id, lang),
    });
  }
  report.saved = report.rows.length;
  return report;
}

/** لغات الواجهة كلها، العربية أولاً. */
export const BUILD_LANGS: readonly string[] = locales;

/** عيّنات خام للفحص حين لا تطابق أسماء الحقول: مخطط الأداتين وأول ردودهما. */
export async function probe(categoryId?: string) {
  const tools = (await listTools()).filter((t) => /hadith/i.test(t.name));
  const sample = async (name: string, args: Record<string, unknown>) => {
    try {
      const r = await callTool(name, args, NO_CACHE);
      return { name, args, structured: JSON.stringify(r.structuredContent ?? null).slice(0, 4000), text: toolText(r).slice(0, 4000) };
    } catch (error) {
      return { name, args, error: String((error as Error)?.message ?? error) };
    }
  };
  const browseTool = tools.find((t) => t.name === "browse_hadith_categories");
  const out = [] as unknown[];
  if (browseTool) {
    out.push(await sample(browseTool.name, langArg(browseTool, "ar")));
    if (categoryId) out.push(await sample(browseTool.name, { ...langArg(browseTool, "ar"), ...idArg(browseTool, /^(category_id|category|id)$/i, categoryId) }));
  }
  let categories: CategoryRef[] = [];
  try {
    categories = await findCategories();
  } catch (error) {
    out.push({ findCategories: String((error as Error)?.message ?? error) });
  }
  const first = categories[0] ? (await listCategory(categories[0]).catch(() => []))[0] : undefined;
  const getTool = tools.find((t) => t.name === "get_hadith");
  if (getTool && first) out.push(await sample(getTool.name, { ...idArg(getTool, /^(id|hadith_id|hadeeth_id)$/i, first.id), ...langArg(getTool, "ar") }));
  return { schemas: tools.map((t) => ({ name: t.name, inputSchema: t.inputSchema })), categories, firstHadith: first, samples: out };
}
