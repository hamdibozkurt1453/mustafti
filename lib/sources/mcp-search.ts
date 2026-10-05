import "server-only";

import { callTool, listTools, toolData, toolText, type McpTool } from "@/lib/mcp";
import { matchKey } from "@/lib/brain/guard";
import { clip, htmlToText } from "./html";
import { stripMcpChrome } from "./mcp-text";

/** نص منشور للعرض: بلا وسوم HTML ولا ترويسة الخادم التقنية. */
const plain = (s: string) => stripMcpChrome(htmlToText(s));
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
        title: clip(plain(title ?? text ?? ""), 160),
        text: clip(plain(text ?? title ?? ""), 600),
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
    out.push({ title: clip(plain(firstLine), 160), text: clip(plain(clean), 600), url, ref: id });
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
      title: clip(plain(line.replace(/[#*_`>]/g, "")), 160),
      text: clip(plain(body.replace(/[#*_`>]/g, "")), 600),
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
    // العربية: التفسير الميسر، ثم المختصر في التفسير إن لم يوجد الميسر.
    const wanted = lang === "ar" ? [preferred, "arabic_mokhtasar"] : [preferred];
    return wanted.find((k) => keys.includes(k)) ?? keys.find((k) => k.startsWith(`${preferred.split("_")[0]}_`));
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
    ? [{ title: `${surah}:${ayah}`, text: clip(plain(text.replace(/[#*_`>]/g, "")), 1200), url: quranencUrl(surah, ayah, lang, quran.key) }]
    : [];
}

/**
 * آيات متتالية (surah:ayah-through) عبر get_quran_verses في طلب واحد: النص العربي، والترجمة
 * المعتمدة بلغة السائل (وللعربية التفسير الميسر arabic_moyassar). يرمي إن رد الخادم بخطأ
 * (آية خارج السورة مثلاً)، ويعيد [] إن لم يرد شيء.
 */
export async function mcpQuranRange(surah: number, ayah: number, through: number | undefined, lang: string): Promise<McpItem[]> {
  const tool = await findTool("get_quran_verses");
  if (!tool) throw new Error("MCP tool `get_quran_verses` not found");
  const props = tool.inputSchema.properties ?? {};
  const key = props.translation_key ? await serverTranslationKey(lang) : undefined;
  const args: Record<string, unknown> = { surah, ayah };
  if (through && through > ayah && props.through) args.through = through;
  if (props.language) args.language = lang;
  if (key) args.translation_key = key;
  const result = await callTool(tool.name, args);
  const text = toolText(result).trim();
  if (!text) return [];
  const quran = { lang, key: key ?? translationKey(lang) };
  // النص يُعاد بأسطره (بلا htmlToText الذي يدمجها سطراً واحداً): تنظيف رأس الخادم وتعليماته
  // يتم سطراً سطراً في lib/brain (cleanToolText)، ودمج الأسطر كان يُفرغ النص كله.
  const lines = text.split("\n");
  return [
    {
      title: clip(lines.find((l) => l.trim() && !/─{3,}|^\s*[[{]/.test(l))?.replace(/[#*_`>]/g, "").trim() ?? `${surah}:${ayah}`, 160),
      text: text.slice(0, 4000),
      url: quranencUrl(surah, ayah, lang, quran.key),
    },
  ];
}

/**
 * البحث في الخادم بلا تقييد المجموعة (sources)، للاحتياط حين يعود البحث المقيَّد فارغاً.
 * كل نتيجة تُعلَّم بمجموعتها (من معرّفها أو رابطها).
 */
export async function mcpSearchAny(query: string, lang: string): Promise<(McpItem & { corpus: McpCorpus })[]> {
  const tool = await findTool("search");
  if (!tool) throw new Error("MCP tool `search` not found");
  const result = await callTool(tool.name, buildArgs(tool, query, lang));
  return collectItems(toolData(result), 12).map((item) => ({
    ...item,
    corpus: /^hadith:/.test(item.ref ?? "") ? "hadith" : /^library:/.test(item.ref ?? "") ? "library" : corpusOf(item),
  }));
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

export type LibraryCategory = { id: string; title: string };

/** قيمة معطى اللغة إن قبلها مخطط الأداة (وإلا العربية إن قبلها، وإلا بلا لغة). */
export function langValue(tool: McpTool, lang: string): Record<string, unknown> {
  const key = findKey(tool, LANG_KEYS);
  if (!key) return {};
  const allowed = tool.inputSchema.properties?.[key]?.enum?.map(String);
  if (!allowed || allowed.includes(lang)) return { [key]: lang };
  return allowed.includes("ar") ? { [key]: "ar" } : allowed.includes("en") ? { [key]: "en" } : {};
}

/** أثر استدعاء أداة (لصفحة الفحص): المعطيات والرد الخام. */
export type McpCallTrace = (tool: string, args: Record<string, unknown>, data: unknown, text: string) => void;

/** تصنيفات مكتبة IslamHouse (list_library_categories)، بمعرّف وعنوان، من JSON أو من أسطر النص. */
export async function mcpLibraryCategories(lang: string, trace?: McpCallTrace): Promise<LibraryCategory[]> {
  const tool = await findTool("list_library_categories");
  if (!tool) throw new Error("MCP tool `list_library_categories` not found");
  const args = langValue(tool, lang);
  const result = await callTool(tool.name, args);
  trace?.(tool.name, args, toolData(result), toolText(result));
  const out: LibraryCategory[] = [];
  const visit = (node: unknown, depth: number) => {
    if (depth > 6 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach((n) => visit(n, depth + 1));
    const o = node as Record<string, unknown>;
    const id = pick(o, ["id", "category_id", "slug", "key", "value"]);
    const title = pick(o, ["title", "name", "label", "category", "category_name"]);
    if (id && title && !out.some((c) => c.id === id)) out.push({ id, title: plain(title) });
    for (const v of Object.values(o)) if (v && typeof v === "object") visit(v, depth + 1);
  };
  visit(toolData(result), 0);
  if (!out.length) {
    for (const line of toolText(result).split("\n")) {
      const m = line.match(/(?:^|[\s[(#-])(\d{1,7}|[a-z][a-z0-9_-]{1,40})\s*[\])]?\s*[-–—:|.]\s*(.{2,120})$/i);
      if (m && !out.some((c) => c.id === m[1])) out.push({ id: m[1], title: m[2].replace(/[*_`#]/g, "").trim() });
    }
  }
  return out;
}

/** أقرب تصنيف لعبارة البحث بتداخل الكلمات (بعد توحيد العربية)، أو null. */
export function bestCategory(query: string, categories: LibraryCategory[]): LibraryCategory | null {
  const words = (t: string) => new Set(matchKey(t).split(" ").map((w) => w.replace(/^(?:وال|بال|فال|لل|ال)(?=..)/, "")).filter((w) => w.length > 2));
  const want = words(query);
  let best: { c: LibraryCategory; n: number } | null = null;
  for (const c of categories) {
    const have = words(c.title);
    const n = [...want].filter((w) => [...have].some((h) => h === w || (w.length >= 4 && (h.includes(w) || w.includes(h))))).length;
    if (n > 0 && (!best || n > best.n)) best = { c, n };
  }
  return best?.c ?? null;
}

/** ردّ الخادم «NOT RETRIEVED» (أو ما يشبهه): لا نتائج، مع سببه. */
const NOT_RETRIEVED = /NOT\s+RETRIEVED|no (?:results|items) (?:found|retrieved)/i;

/**
 * البحث في مكتبة IslamHouse: list_library_categories أولاً، ثم browse_library بتصنيف ولغة صحيحين
 * (وبعبارة البحث إن قبلها المخطط). كان استدعاؤها بالاسم وحده يعيد «NOT RETRIEVED».
 * R1e: **موقوف في المسار الحي** (HTTP 500 / NOT RETRIEVED بكل التركيبات)؛ لا يستدعيه إلا الفحص.
 */
export async function mcpLibrary(query: string, lang: string, trace?: McpCallTrace): Promise<McpItem[]> {
  const tool = await findTool("browse_library");
  if (!tool) throw new Error("MCP tool `browse_library` not found");
  const catKey = Object.keys(tool.inputSchema.properties ?? {}).find((k) => /categor/i.test(k));
  const category = catKey ? bestCategory(query, await mcpLibraryCategories(lang, trace)) : null;
  if (catKey && !category) return [];
  const langCode = await mcpLibraryLanguage(lang).catch(() => null);
  let lastText = "";
  // التركيبات بالترتيب حتى تأتي نتائج (رقم التصنيف بنوعه، ورمز اللغة من list_languages، والنوع).
  for (const args of libraryArgCombos(tool, category?.id ?? null, langCode, query)) {
    const result = await callTool(tool.name, args);
    const text = toolText(result);
    lastText = text;
    trace?.(tool.name, args, toolData(result), text);
    const items = collectItems(toolData(result), 12, undefined, undefined, { lang });
    const found = items.length ? items : NOT_RETRIEVED.test(text) ? [] : libraryItemsFromText(text, lang);
    if (found.length) return found;
  }
  if (NOT_RETRIEVED.test(lastText)) throw new Error(`browse_library: ${clip(lastText, 160)}`);
  return [];
}

/** قيمة معطى بنوعه في المخطط (رقم إن كان integer/number والقيمة أرقام). */
function typed(tool: McpTool, key: string, value: string): string | number {
  const t = tool.inputSchema.properties?.[key]?.type;
  return (t === "integer" || t === "number") && /^\d+$/.test(value) ? Number(value) : value;
}

/**
 * رمز اللغة كما يعيده list_languages (إن وُجدت الأداة): القيمة التي تطابق رمز السائل أو اسم لغته.
 * يعيد null إن لم توجد الأداة أو لم يُعرف الرمز.
 */
export async function mcpLibraryLanguage(lang: string): Promise<string | null> {
  const tool = await findTool("list_languages");
  if (!tool) return null;
  const result = await callTool(tool.name, {});
  const names: Record<string, RegExp> = { ar: /arab|عرب/i, en: /english|إنجليز/i, fr: /fran|فرنس/i, tr: /turk|ترك/i, ur: /urdu|أردو|اردو/i, id: /indones|إندونيس/i };
  let byName: string | null = null;
  const visit = (node: unknown, depth: number): string | null => {
    if (depth > 6 || !node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
      for (const n of node) {
        const v = visit(n, depth + 1);
        if (v) return v;
      }
      return null;
    }
    const o = node as Record<string, unknown>;
    const code = pick(o, ["code", "language_code", "iso", "iso_code", "slug", "locale", "short_name", "id"]);
    const name = pick(o, ["name", "title", "native_name", "english_name", "label"]);
    if (code && code.toLowerCase() === lang.toLowerCase()) return code;
    if (code && !byName && name && names[lang]?.test(name)) byName = code;
    for (const v of Object.values(o)) {
      const found = v && typeof v === "object" ? visit(v, depth + 1) : null;
      if (found) return found;
    }
    return null;
  };
  return visit(toolData(result), 0) ?? byName;
}

/**
 * تركيبات معطيات browse_library من مخططها (حتى 3): التصنيف بنوعه واللغة بالرمز المعتمد،
 * ثم مع النوع (fatwa/article من enum إن وُجد)، ثم التصنيف وحده. والمعطيات المطلوبة الأخرى بأول
 * قيمة في enum إن وُجد.
 */
export function libraryArgCombos(tool: McpTool, categoryId: string | null, langCode: string | null, query: string): Record<string, unknown>[] {
  const props = tool.inputSchema.properties ?? {};
  const keys = Object.keys(props);
  const catKey = keys.find((k) => /categor/i.test(k));
  const langKey = findKey(tool, LANG_KEYS);
  const typeKey = keys.find((k) => /^(?:type|kind|content_type|contentType|item_type|resource_type)$/i.test(k));
  const qKey = keys.find((k) => k !== catKey && [...QUERY_KEYS, "name", "title"].includes(k));
  const base: Record<string, unknown> = {};
  if (catKey && categoryId) base[catKey] = typed(tool, catKey, categoryId);
  if (qKey) base[qKey] = query;
  for (const req of tool.inputSchema.required ?? []) {
    if (req in base || req === langKey || req === typeKey) continue;
    const first = props[req]?.enum?.[0];
    if (first !== undefined) base[req] = first;
  }
  const langArg: Record<string, unknown> = {};
  if (langKey) {
    const allowed = props[langKey]?.enum?.map(String);
    const value = langCode ?? "ar";
    langArg[langKey] = allowed && !allowed.includes(String(value)) ? (allowed.find((v) => /^ar/i.test(v)) ?? allowed[0]) : typed(tool, langKey, String(value));
  }
  const combos: Record<string, unknown>[] = [{ ...base, ...langArg }];
  if (typeKey) {
    const options = props[typeKey]?.enum?.map(String) ?? [];
    const type = options.find((v) => /fatw/i.test(v)) ?? options.find((v) => /article/i.test(v)) ?? "fatwa";
    combos.push({ ...base, ...langArg, [typeKey]: type });
  }
  combos.push({ ...base });
  const seen = new Set<string>();
  return combos.filter((c) => {
    const k = JSON.stringify(c);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 3);
}

/**
 * قيم المعطى sources في أداة search كما يعلنها الخادم (enum)، وما سوى القرآن والحديث والمكتبة منها
 * (أسئلة وأجوبة islamenc، أو فتاوى IslamHouse إن وُجدت) يُبحث فيه أيضاً.
 */
export async function mcpSearchSources(): Promise<{ all: string[]; extra: string[] }> {
  const tool = await findTool("search");
  const prop = tool?.inputSchema.properties?.sources as { enum?: unknown[]; items?: { enum?: unknown[] } } | undefined;
  const all = (prop?.items?.enum ?? prop?.enum ?? []).map(String);
  const known = (v: string) => Object.values(CORPUS_MATCH).some((re) => re.test(v)) && !/qa|question|fatw|islamenc|answer/i.test(v);
  // «search» و«all» قيم عامة لا مجموعات.
  return { all, extra: all.filter((v) => !known(v) && !/^(?:search|all|any|everything)$/i.test(v)) };
}

/** البحث في مجموعة إضافية بقيمتها كما أعلنها الخادم. */
export async function mcpSearchExtra(query: string, lang: string, source: string): Promise<McpItem[]> {
  const tool = await findTool("search");
  if (!tool) throw new Error("MCP tool `search` not found");
  const prop = tool.inputSchema.properties?.sources as { type?: string } | undefined;
  const result = await callTool(tool.name, { ...buildArgs(tool, query, lang), sources: prop?.type === "string" ? source : [source] });
  return collectItems(toolData(result), 8);
}

const GRADE_KEYS = ["grade", "hadith_grade", "grade_ar", "hukm", "degree", "attribution_grade", "authenticity", "hadeeth_grade"];
const HADITH_TEXT_KEYS = ["hadeeth", "hadith", "hadith_text", "hadeeth_text", "text_ar", "arabic_text", "arabic", "text", "content", "body"];
const ID_KEYS = ["id", "ref", "doc_id", "document_id", "docId", "uri"];

/** درجة مكتوبة في نص Markdown: «الدرجة: صحيح» أو «Grade: Sahih». */
const GRADE_LINE = /(?:^|\n)\s*[*_#>\-\s]*(?:الدرجة|درجة الحديث|درجته|الحكم|Grade|Degree|Authenticity)\s*[*_]*\s*[:：]\s*[*_]*\s*([^\n]+)/i;

/**
 * النص الكامل لحديث ودرجته بأداة fetch من خادم MCP بمعرّفه (ref من نتيجة البحث).
 * يعيد grade فارغاً إن لم يذكرها الخادم؛ والمتصل يحذف الحديث حينها (لا حديث بلا درجة).
 */
export async function mcpFetchHadith(ref: string): Promise<{ text?: string; grade?: string; url?: string }> {
  const tool = await findTool("fetch");
  if (!tool) throw new Error("MCP tool `fetch` not found");
  const props = Object.keys(tool.inputSchema.properties ?? {});
  const key = ID_KEYS.find((k) => props.includes(k)) ?? tool.inputSchema.required?.[0] ?? props[0] ?? "id";
  const result = await callTool(tool.name, { [key]: ref });
  const data = toolData(result);

  let grade: string | undefined;
  let text: string | undefined;
  let url: string | undefined;
  const visit = (node: unknown, depth: number) => {
    if (depth > 6 || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach((n) => visit(n, depth + 1));
    const o = node as Record<string, unknown>;
    grade ??= pick(o, GRADE_KEYS);
    text ??= pick(o, HADITH_TEXT_KEYS);
    url ??= pick(o, ["url", "link", "source_url", "permalink"]);
    for (const value of Object.values(o)) if (value && typeof value === "object") visit(value, depth + 1);
  };
  visit(data, 0);

  // رد نصي بلا JSON: الدرجة من سطرها، والنص كما هو.
  const raw = toolText(result);
  if (!grade) grade = raw.match(GRADE_LINE)?.[1]?.replace(/[*_]+/g, "").trim();
  if (!text && raw.trim()) text = raw;
  return {
    text: text ? clip(plain(text.replace(/[#*_`>]/g, "")), 1500) : undefined,
    grade: grade ? clip(plain(grade), 120) : undefined,
    url: url && /^https?:\/\//.test(url) ? url : undefined,
  };
}
