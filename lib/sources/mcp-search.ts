import "server-only";

import { callTool, listTools, toolData, toolText, type McpTool } from "@/lib/mcp";
import { clip, htmlToText } from "./html";

/**
 * البحث عبر خادم MCP للجمعية. معطيات الأداة تُبنى من مخططها (inputSchema) كما يعلنه الخادم،
 * فلا نفترض أسماء الحقول، ونتائجها تُقرأ بمرونة (structuredContent أو JSON في النص).
 * كل نتيجة تحمل رابط مصدرها، ومنه نعرف المنصة (quranenc، hadeethenc، islamhouse…).
 */

/** ref: معرّف النتيجة في الخادم (لأداة fetch لاحقاً: النص الكامل ودرجة الحديث). */
export type McpItem = { title: string; text: string; url: string; grade?: string; lang?: string; ref?: string };

const QUERY_KEYS = ["query", "q", "search", "keyword", "keywords", "text", "term"];
const LANG_KEYS = ["language", "lang", "locale", "language_code", "languageCode"];
const LIMIT_KEYS = ["limit", "max_results", "maxResults", "per_page", "top_k", "count"];

function findKey(tool: McpTool, keys: string[]): string | undefined {
  const props = Object.keys(tool.inputSchema?.properties ?? {});
  return keys.find((k) => props.includes(k)) ?? props.find((p) => keys.some((k) => p.toLowerCase().includes(k.toLowerCase())));
}

/** يبني معطيات الأداة من مخططها: نص البحث، واللغة، وعدد النتائج إن وُجدت حقولها. */
export function buildArgs(tool: McpTool, query: string, lang: string, extra: Record<string, unknown> = {}) {
  const args: Record<string, unknown> = {};
  const q = findKey(tool, QUERY_KEYS);
  if (q) args[q] = query;
  const l = findKey(tool, LANG_KEYS);
  if (l) {
    const allowed = tool.inputSchema.properties?.[l]?.enum;
    if (!allowed || allowed.includes(lang)) args[l] = lang;
  }
  const n = findKey(tool, LIMIT_KEYS);
  if (n && tool.inputSchema.properties?.[n]?.type !== "string") args[n] = 8;
  for (const [key, value] of Object.entries(extra)) {
    if (tool.inputSchema.properties?.[key]) args[key] = value;
  }
  return args;
}

export async function findTool(name: string): Promise<McpTool | undefined> {
  return (await listTools()).find((t) => t.name === name);
}

const pick = (o: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return undefined;
};

/**
 * يمشي في JSON النتيجة ويجمع كل كائن فيه رابط وعنوان أو نص.
 * fallbackUrl: لواجهات لا تعيد رابطاً لكل نتيجة، فيُستعمل رابط صفحة البحث في الموقع نفسه.
 */
export function collectItems(data: unknown, max = 12, fallbackUrl?: string): McpItem[] {
  const out: McpItem[] = [];
  const seen = new Set<string>();
  const visit = (node: unknown, depth: number) => {
    if (out.length >= max || depth > 6 || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((n) => visit(n, depth + 1));
      return;
    }
    const o = node as Record<string, unknown>;
    const url = pick(o, ["url", "link", "source_url", "sourceUrl", "permalink", "href", "web_url"]) ?? fallbackUrl;
    const title = pick(o, ["title", "name", "heading", "question", "hadeeth_title", "sura_name"]);
    const text = pick(o, [
      "text",
      "snippet",
      "content",
      "translation",
      "hadeeth",
      "explanation",
      "answer",
      "description",
      "summary",
      "body",
      "excerpt",
    ]);
    const key = `${url}|${title ?? ""}`;
    if (url && /^https?:\/\//.test(url) && (title || text) && !seen.has(key)) {
      seen.add(key);
      out.push({
        url,
        title: clip(htmlToText(title ?? text ?? ""), 160),
        text: clip(htmlToText(text ?? title ?? ""), 600),
        grade: pick(o, ["grade", "hadith_grade", "grade_ar", "hukm", "degree", "attribution_grade", "authenticity"]),
        lang: pick(o, ["language", "lang", "locale"]),
        ref: pick(o, ["id", "doc_id", "document_id"]),
      });
    }
    for (const value of Object.values(o)) {
      if (value && typeof value === "object") visit(value, depth + 1);
    }
  };
  visit(data, 0);
  return out;
}

/** مجموعات المحتوى التي يغطيها بحث الخادم (وصف أداة search: القرآن، والحديث، ومكتبة IslamHouse). */
export type McpCorpus = "quran" | "hadith" | "library";

const CORPUS_MATCH: Record<McpCorpus, RegExp> = {
  quran: /quran|qur|ayah|verse/i,
  hadith: /hadith|hadeeth|sunnah/i,
  library: /library|islamhouse|house|book/i,
};

/**
 * قيمة المعطى sources لمجموعة واحدة، من enum في مخطط الأداة إن أعلنه الخادم،
 * وإلا الاسم البديهي. تحديد المجموعة يجعل البحث أسرع، ويمنع نسبة نتيجة لغير مصدرها
 * (نتائج القرآن مثلاً تأتي بروابط islamenc.com لا quranenc.com).
 */
function sourcesArg(tool: McpTool, corpus: McpCorpus): unknown {
  const prop = tool.inputSchema.properties?.sources as
    | { type?: string; enum?: unknown[]; items?: { enum?: unknown[] } }
    | undefined;
  if (!prop) return undefined;
  const options = (prop.items?.enum ?? prop.enum ?? []).map(String);
  const value = options.find((o) => CORPUS_MATCH[corpus].test(o)) ?? corpus;
  return prop.type === "string" ? value : [value];
}

/** تصنيف نتيجة بلا معطى sources: بنطاق الرابط وحقولها. */
function corpusOf(item: McpItem): McpCorpus {
  if (/hadeethenc\.com/.test(item.url)) return "hadith";
  if (/islamhouse\.com/.test(item.url)) return "library";
  return "quran";
}

/**
 * بحث الخادم في مجموعة واحدة (مخزّن 24 ساعة في lib/mcp.ts).
 * إن رفض الخادم قيمة sources نعيد البحث بدونها ونصنّف النتائج بأنفسنا.
 */
export async function mcpSearch(query: string, lang: string, corpus: McpCorpus): Promise<McpItem[]> {
  const tool = await findTool("search");
  if (!tool) throw new Error("MCP tool `search` not found");
  const base = buildArgs(tool, query, lang);
  const sources = sourcesArg(tool, corpus);

  let result;
  let filtered = false;
  try {
    result = await callTool(tool.name, sources === undefined ? base : { ...base, sources });
    filtered = sources !== undefined;
  } catch (error) {
    if (sources === undefined || /timed? ?out|timeout/i.test(String((error as Error).message))) throw error;
    result = await callTool(tool.name, base);
  }

  let items = collectItems(toolData(result));
  if (!items.length) {
    // نتيجة نصية بلا JSON: نعيدها مقتطفاً واحداً إن وُجد فيها رابط.
    const text = toolText(result);
    const link = text.match(/https?:\/\/[^\s)"'<>]+/)?.[0];
    items = link ? [{ title: clip(text, 120), text: clip(text, 600), url: link }] : [];
  }
  return filtered ? items : items.filter((item) => corpusOf(item) === corpus);
}

/** آية أو آيات بعينها عبر get_quran_verses (أسرع من البحث). */
export async function mcpQuranVerses(surah: number, ayah: number, lang: string): Promise<McpItem[]> {
  const tool = await findTool("get_quran_verses");
  if (!tool) throw new Error("MCP tool `get_quran_verses` not found");
  const args: Record<string, unknown> = { surah, ayah };
  if (tool.inputSchema.properties?.language) args.language = lang;
  return collectItems(toolData(await callTool(tool.name, args)));
}

/** البحث في عناوين مكتبة IslamHouse عبر browse_library (المعطى name). */
export async function mcpLibrary(query: string, lang: string): Promise<McpItem[]> {
  const tool = await findTool("browse_library");
  if (!tool) throw new Error("MCP tool `browse_library` not found");
  const args: Record<string, unknown> = { name: query };
  if (tool.inputSchema.properties?.language) args.language = lang;
  return collectItems(toolData(await callTool(tool.name, args)));
}
