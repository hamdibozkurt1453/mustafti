import "server-only";

import { callTool, listTools, toolData, toolText, type McpTool } from "@/lib/mcp";
import { clip, htmlToText } from "./html";

/**
 * البحث عبر خادم MCP للجمعية. معطيات الأداة تُبنى من مخططها (inputSchema) كما يعلنه الخادم،
 * فلا نفترض أسماء الحقول، ونتائجها تُقرأ بمرونة (structuredContent أو JSON في النص).
 * كل نتيجة تحمل رابط مصدرها، ومنه نعرف المنصة (quranenc، hadeethenc، islamhouse…).
 */

export type McpItem = { title: string; text: string; url: string; grade?: string; lang?: string };

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
        grade: pick(o, ["grade", "hukm", "degree", "attribution_grade", "authenticity"]),
        lang: pick(o, ["language", "lang", "locale"]),
      });
    }
    for (const value of Object.values(o)) {
      if (value && typeof value === "object") visit(value, depth + 1);
    }
  };
  visit(data, 0);
  return out;
}

/** بحث عام عبر أداة search في الخادم (مشترك بين المنصات، ومخزّن 24 ساعة في lib/mcp.ts). */
export async function mcpSearch(query: string, lang: string): Promise<McpItem[]> {
  const tool = await findTool("search");
  if (!tool) throw new Error("MCP tool `search` not found");
  const result = await callTool(tool.name, buildArgs(tool, query, lang));
  const items = collectItems(toolData(result));
  if (items.length) return items;
  // نتيجة نصية بلا JSON: نعيدها مقتطفاً واحداً إن وُجد فيها رابط.
  const text = toolText(result);
  const link = text.match(/https?:\/\/[^\s)"'<>]+/)?.[0];
  return link ? [{ title: clip(text, 120), text: clip(text, 600), url: link }] : [];
}

/** نتائج MCP الخاصة بمنصة واحدة (بحسب نطاق الرابط). */
export async function mcpSearchHost(query: string, lang: string, hosts: string[]): Promise<McpItem[]> {
  const items = await mcpSearch(query, lang);
  return items.filter((item) => {
    try {
      const host = new URL(item.url).hostname.replace(/^www\./, "");
      return hosts.some((h) => host === h || host.endsWith(`.${h}`));
    } catch {
      return false;
    }
  });
}

/** يستدعي أداة متخصصة (مثل get_hadith) بمعطيات مبنية من مخططها، ويجمع نتائجها. */
export async function mcpToolSearch(toolName: string, query: string, lang: string, extra: Record<string, unknown> = {}) {
  const tool = await findTool(toolName);
  if (!tool) throw new Error(`MCP tool \`${toolName}\` not found`);
  const result = await callTool(tool.name, buildArgs(tool, query, lang, extra));
  return collectItems(toolData(result));
}
