import "server-only";

import { callTool, listTools, toolData, toolText, type McpTool } from "@/lib/mcp";
import { clip, htmlToText } from "./html";
import { quranencUrl, translationKey } from "./quran";

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
 * والآية التي ليس لها رابط يُبنى رابطها من رقمي السورة والآية.
 */
export function collectItems(
  data: unknown,
  max = 12,
  fallbackUrl?: string,
  /** نتائج قرآن: لغة السائل ومفتاح الترجمة لبناء روابط الآيات. */
  quran?: { lang: string; key: string },
  /** نتائج IslamHouse بلا رابط: يُبنى رابط المادة من معرّفها ونوعها. */
  library?: { lang: string },
): McpItem[] {
  const out: McpItem[] = [];
  const seen = new Set<string>();
  const visit = (node: unknown, depth: number) => {
    if (out.length >= max || depth > 6 || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((n) => visit(n, depth + 1));
      return;
    }
    const o = node as Record<string, unknown>;
    // آية بلا رابط (رقم السورة والآية فقط): نبني رابطها في موسوعة القرآن.
    const surah = Number(o.surah ?? o.sura ?? o.surah_number ?? o.sura_id ?? o.chapter);
    const ayah = Number(o.ayah ?? o.aya ?? o.ayah_number ?? o.verse ?? o.verse_number ?? o.aya_number);
    const isVerse = Number.isInteger(surah) && surah >= 1 && surah <= 114 && Number.isInteger(ayah) && ayah >= 1;
    const url =
      pick(o, ["url", "link", "source_url", "sourceUrl", "citation_url", "citationUrl", "citation", "permalink", "href", "web_url", "uri"]) ??
      (isVerse && quran ? quranencUrl(surah, ayah, quran.lang, quran.key) : undefined) ??
      (library ? islamhouseUrl(o, library.lang) : undefined) ??
      fallbackUrl;
    const title =
      pick(o, ["title", "name", "heading", "question", "hadeeth_title", "sura_name", "surah_name"]) ??
      (isVerse ? `${surah}:${ayah}` : undefined);
    const text = pick(o, [
      "arabic_text",
      "text_ar",
      "arabic",
      "verse_text",
      "text",
      "snippet",
      "content",
      "translation",
      "translation_text",
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

const ISLAMHOUSE_TYPES: Record<string, string> = {
  book: "books",
  books: "books",
  article: "articles",
  articles: "articles",
  audio: "audios",
  audios: "audios",
  video: "videos",
  videos: "videos",
  fatwa: "fatwa",
  fatwas: "fatwa",
  poster: "posters",
  posters: "posters",
};

/** رابط مادة IslamHouse من معرّفها ونوعها (حين لا يعيد الخادم رابطاً): islamhouse.com/{lang}/{type}/{id}/ */
export function islamhouseUrl(o: Record<string, unknown>, lang: string): string | undefined {
  const id = pick(o, ["id", "item_id", "itemId", "library_id", "doc_id"]);
  if (!id || !/^\d+$/.test(id)) return undefined;
  const type = (pick(o, ["type", "content_type", "contentType", "kind", "item_type"]) ?? "books").toLowerCase();
  return `https://islamhouse.com/${lang}/${ISLAMHOUSE_TYPES[type] ?? "books"}/${id}/`;
}

/** نتيجة نصية (Markdown) من المكتبة بلا JSON: كل كتلة فيها عنوان ومعرّف رقمي نتيجة. */
export function libraryItemsFromText(text: string, lang: string, max = 8): McpItem[] {
  const out: McpItem[] = [];
  for (const block of text.split(/\n\s*\n|\n(?=#{1,4}\s|\d+\.\s|[-*]\s+\*\*)/)) {
    if (out.length >= max) break;
    const clean = block.replace(/[#*_`>]/g, "").trim();
    const link = clean.match(/https?:\/\/[^\s)"'<>]*islamhouse\.com[^\s)"'<>]*/)?.[0];
    const id = clean.match(/\b(?:id|ID|Id)\s*[:=]\s*(\d{3,})/)?.[1];
    const url = link ?? (id ? islamhouseUrl({ id }, lang) : undefined);
    if (!url || clean.length < 8) continue;
    const firstLine = clean.split("\n")[0];
    out.push({ title: clip(htmlToText(firstLine), 160), text: clip(htmlToText(clean), 600), url, ref: id });
  }
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

/**
 * نتائج قرآن نصية (Markdown) بلا JSON: كل إشارة «سورة:آية» في النص نتيجة، مقتطفها سطرها
 * وما يليه، ورابطها في موسوعة القرآن.
 */
export function quranItemsFromText(text: string, lang: string, key: string, max = 8): McpItem[] {
  const out: McpItem[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (out.length >= max) return;
    const m = line.match(/(?:^|[^\d])(\d{1,3})\s*[:：]\s*(\d{1,3})(?![\d])/);
    if (!m) return;
    const [surah, ayah] = [Number(m[1]), Number(m[2])];
    if (surah < 1 || surah > 114 || ayah < 1 || seen.has(`${surah}:${ayah}`)) return;
    seen.add(`${surah}:${ayah}`);
    const following: string[] = [];
    for (const next of lines.slice(i + 1, i + 4)) {
      if (/\d{1,3}\s*[:：]\s*\d{1,3}/.test(next)) break; // بداية الآية التالية
      following.push(next);
    }
    const body = [line, ...following].join(" ");
    out.push({
      title: clip(htmlToText(line.replace(/[#*_`>]/g, "")), 160),
      text: clip(htmlToText(body.replace(/[#*_`>]/g, "")), 600),
      url: quranencUrl(surah, ayah, lang, key),
    });
  });
  return out;
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

  const quran = corpus === "quran" ? { lang, key: translationKey(lang) } : undefined;
  const library = corpus === "library" ? { lang } : undefined;
  let items = collectItems(toolData(result), 12, undefined, quran, library);
  if (!items.length) {
    const text = toolText(result);
    if (quran) {
      items = quranItemsFromText(text, lang, quran.key);
    } else if (library) {
      items = libraryItemsFromText(text, lang);
    } else {
      // نتيجة نصية بلا JSON: نعيدها مقتطفاً واحداً إن وُجد فيها رابط.
      const link = text.match(/https?:\/\/[^\s)"'<>]+/)?.[0];
      items = link ? [{ title: clip(text, 120), text: clip(text, 600), url: link }] : [];
    }
  }
  return filtered ? items : items.filter((item) => corpusOf(item) === corpus);
}

/**
 * مفتاح ترجمة يقبله الخادم للغة: من list_quran_translations (مخزّن 24 ساعة)، ونفضّل
 * مفتاحنا المعتمد إن ورد في القائمة. يعيد undefined إن تعذّرت القائمة (فيختار الخادم).
 */
async function serverTranslationKey(lang: string): Promise<string | undefined> {
  const tool = await findTool("list_quran_translations");
  if (!tool) return undefined;
  try {
    const result = await callTool(tool.name, tool.inputSchema.properties?.language ? { language: lang } : {});
    const raw = JSON.stringify(toolData(result)) + "\n" + toolText(result);
    const keys = [...new Set([...raw.matchAll(/\b([a-z]+_[a-z0-9_]+)\b/g)].map((m) => m[1]))];
    const preferred = translationKey(lang);
    return keys.includes(preferred) ? preferred : keys.find((k) => k.startsWith(`${preferred.split("_")[0]}_`));
  } catch {
    return undefined;
  }
}

/** آية بعينها عبر get_quran_verses (أسرع من البحث)، بنصها العربي وترجمة معتمدة بلغة السائل. */
export async function mcpQuranVerses(surah: number, ayah: number, lang: string): Promise<McpItem[]> {
  const tool = await findTool("get_quran_verses");
  if (!tool) throw new Error("MCP tool `get_quran_verses` not found");
  const props = tool.inputSchema.properties ?? {};
  const key = props.translation_key ? await serverTranslationKey(lang) : undefined;
  const args: Record<string, unknown> = { surah, ayah };
  if (props.language) args.language = lang;
  if (key) args.translation_key = key;
  const result = await callTool(tool.name, args);
  const quran = { lang, key: key ?? translationKey(lang) };
  const items = collectItems(toolData(result), 4, undefined, quran);
  if (items.length) return items;
  // نص بلا JSON: الآية المطلوبة نفسها نتيجة واحدة برابطها.
  const text = toolText(result).trim();
  return text
    ? [{ title: `${surah}:${ayah}`, text: clip(htmlToText(text.replace(/[#*_`>]/g, "")), 1200), url: quranencUrl(surah, ayah, lang, quran.key) }]
    : [];
}

/** عيّنة خام من ردود أدوات القرآن (لـ /api/health?debug=1): لفهم صيغة الرد إن بقيت النتائج صفراً. */
export async function mcpQuranSamples(): Promise<{ tool: string; args: Record<string, unknown>; structured: string; text: string; error?: string }[]> {
  const calls: [string, Record<string, unknown>][] = [
    ["get_quran_verses", { surah: 1, ayah: 2, language: "ar" }],
    ["search", { query: "الصلاة", language: "ar", limit: 3 }],
    ["list_quran_translations", { language: "ar" }],
  ];
  const searchTool = await findTool("search");
  if (searchTool) {
    const sources = sourcesArg(searchTool, "quran");
    if (sources !== undefined) calls[1][1].sources = sources;
  }
  return Promise.all(
    calls.map(async ([tool, args]) => {
      try {
        const result = await callTool(tool, args);
        const structured = result.structuredContent === undefined ? "" : JSON.stringify(result.structuredContent).slice(0, 700);
        return { tool, args, structured, text: toolText(result).slice(0, 900) };
      } catch (error) {
        return { tool, args, structured: "", text: "", error: String((error as Error).message).slice(0, 200) };
      }
    }),
  );
}

/** البحث في عناوين مكتبة IslamHouse عبر browse_library (المعطى name). */
export async function mcpLibrary(query: string, lang: string): Promise<McpItem[]> {
  const tool = await findTool("browse_library");
  if (!tool) throw new Error("MCP tool `browse_library` not found");
  const args: Record<string, unknown> = { name: query };
  if (tool.inputSchema.properties?.language) args.language = lang;
  const result = await callTool(tool.name, args);
  const items = collectItems(toolData(result), 12, undefined, undefined, { lang });
  return items.length ? items : libraryItemsFromText(toolText(result), lang);
}
