import "server-only";

import { matchBasics, verseRefsInText } from "@/lib/brain/basics";
import { explicitVerseRef } from "@/lib/brain/quran-index";
import { webSearchRead, type WebResult } from "@/lib/brain/web";
import { keywords } from "@/lib/brain/rank";
import { searchIslamqaLocal, type IslamqaQuery } from "./islamqaLocal";
import { callTool, listTools, toolData, toolText } from "@/lib/mcp";
import { clip } from "./html";
import {
  bestCategory,
  collectItems,
  findTool,
  libraryArgCombos,
  mcpLibraryCategories,
  mcpLibraryLanguage,
  mcpQuranVerses,
  mcpSearch,
  mcpSearchExtra,
  mcpSearchSources,
} from "./mcp-search";
import { stripMcpChrome } from "./mcp-text";
import { fatwaResult, fetchAyahTafsir, fetchAyahTranslation, fetchFatwas, fetchItems, type RawTrace } from "./quranpedia";
import { dorarResult, fetchDorar } from "./dorar";
import { search } from "./index";
import type { SourceResult } from "./types";

/**
 * صفحة فحص المصادر للمشرف (/api/admin/sources-probe): كل مصدر على حدة، بسؤال يكتبه المشرف،
 * بلا ذاكرة مؤقتة لمصادر HTTP (لقياس الزمن الحقيقي). بيئة التطوير لا تصل إلى الإنترنت، فهذه
 * الصفحة هي طريقة فحص الموصّلات حياً: الحالة، والزمن، والنتائج، ومفاتيح الرد الخام وأوله.
 */

export type ProbeSourceId =
  | "web"
  | "qp_fatwas"
  | "qp_tafsir"
  | "qp_translation"
  | "qp_topics"
  | "qp_books"
  | "mcp_tools"
  | "mcp_hadith"
  | "mcp_quran"
  | "mcp_verses"
  | "mcp_library"
  | "mcp_library_search"
  | "mcp_extra"
  | "bayyinat"
  | "islamqa_local"
  | "basics"
  | "dorar";

export const PROBE_SOURCES: { id: ProbeSourceId; label: string; deadlineMs: number; scoreAll?: boolean }[] = [
  { id: "web", label: "ابحث واقرأ — أدوات OpenRouter (web_search + web_fetch) في نطاقات المرجعية", deadlineMs: 45_000 },
  { id: "qp_fatwas", label: "Quranpedia — فتاوى منشورة (كلها مرتبة بالدرجة)", deadlineMs: 10_000, scoreAll: true },
  { id: "qp_tafsir", label: "Quranpedia — تفسير آية (للفحص فقط: موقوف في المحادثة)", deadlineMs: 15_000 },
  { id: "qp_translation", label: "Quranpedia — ترجمة معنى آية (للفحص فقط: موقوفة في المحادثة)", deadlineMs: 10_000 },
  { id: "qp_topics", label: "Quranpedia — موضوعات", deadlineMs: 8_000 },
  { id: "qp_books", label: "Quranpedia — كتب", deadlineMs: 8_000 },
  { id: "mcp_tools", label: "MCP — كل الأدوات بمخططها (inputSchema)، وقيم sources في search", deadlineMs: 15_000 },
  { id: "mcp_hadith", label: "MCP — search (الحديث) + fetch للدرجة", deadlineMs: 26_000 },
  { id: "mcp_quran", label: "MCP — search (القرآن)", deadlineMs: 26_000 },
  { id: "mcp_verses", label: "MCP — get_quran_verses (آية من السؤال فقط)", deadlineMs: 15_000 },
  { id: "mcp_library", label: "MCP — browse_library بثلاث تركيبات (للفحص فقط: موقوف في المحادثة، R1e)", deadlineMs: 40_000 },
  { id: "mcp_library_search", label: "MCP — search (sources=library): فتاوى ومقالات IslamHouse", deadlineMs: 26_000 },
  { id: "mcp_extra", label: "MCP — search في المجموعات الإضافية (إن أعلنها الخادم)", deadlineMs: 20_000 },
  { id: "bayyinat", label: "بيّنات (Supabase: search_bayyinat)", deadlineMs: 8_000 },
  { id: "islamqa_local", label: "الإسلام سؤال وجواب محلياً (Supabase: search_islamqa، مقتطف يقتطعه الكود)", deadlineMs: 8_000, scoreAll: true },
  { id: "basics", label: "الأساسيات (data/basics.json)", deadlineMs: 2_000 },
  { id: "dorar", label: "الدرر السنية من الخادم (للتوثيق فقط: المحادثة تطلبها من المتصفح)", deadlineMs: 8_000 },
];

export type ProbeOutcome = {
  results: SourceResult[];
  /** ملاحظات: العبارات، والنطاقات المستبعدة، والسبب إن تُخطّي المصدر. */
  notes: string[];
  /** أثر الطلبات الخام: المسار، ومفاتيح الرد، وأول 300 حرف. */
  raw?: RawTrace[];
  /** «ابحث واقرأ»: النتيجة كاملة. */
  web?: WebResult;
  /** أدوات MCP بمخططاتها. */
  tools?: { name: string; description?: string; inputSchema: unknown }[];
  /** لم يُشغَّل (لا آية في السؤال مثلاً). */
  skipped?: boolean;
};

function verseOf(question: string): { surah: number; ayah: number } | null {
  const ref = explicitVerseRef(question) ?? verseRefsInText(question)[0];
  return ref ? { surah: ref.surah, ayah: ref.ayah } : null;
}

const uniqueByUrl = (xs: SourceResult[]) => [...new Map(xs.map((x) => [x.url, x])).values()];

/** أثر رد أداة MCP (المفاتيح وأول 300 حرف). */
function mcpTrace(path: string, data: unknown, text: string): RawTrace {
  const keys = data && typeof data === "object" ? Object.keys(data as object).slice(0, 30) : [typeof data];
  return { path, keys, head: (typeof data === "string" ? text : JSON.stringify(data)).slice(0, 300) };
}

/** يشغّل مصدراً واحداً بعبارات البحث (أول عبارتين). يرمي عند الفشل. */
export async function runProbeSource(
  id: ProbeSourceId,
  question: string,
  queries: string[],
  lang: string,
  level: string | null,
  bayyinat: (q: string) => Promise<SourceResult[]>,
): Promise<ProbeOutcome> {
  const qs = (queries.length ? queries : [question]).slice(0, 2);
  const notes: string[] = [`العبارات: ${qs.join(" · ")}`];
  const each = async (fn: (q: string) => Promise<SourceResult[]>) => uniqueByUrl((await Promise.all(qs.map(fn))).flat());
  const noVerse = (): ProbeOutcome => ({ results: [], notes: ["لا مرجع آية في السؤال: لا يُستدعى (لا آية افتراضية)."], skipped: true });

  switch (id) {
    case "web": {
      const mode = level === "D" ? "case" : "general";
      const web = await webSearchRead(question, { mode, lang, phrases: queries, timeoutMs: 40_000 });
      return { results: [], notes: [`الوضع: ${mode === "case" ? "فتاوى منشورة مشابهة (D)" : "عام"}`], web };
    }
    case "islamqa_local": {
      const errors: string[] = [];
      const terms = [...new Set([question, ...qs].flatMap((q) => keywords(q)))];
      const local: IslamqaQuery[] = qs.map((q) => ({ q, lang: "ar" }));
      if (/[\u0600-\u06FF]/.test(question)) local.unshift({ q: question, lang: "ar" });
      if (lang === "en") local.push({ q: question, lang: "en" });
      const results = await searchIslamqaLocal(local, lang, terms, { onError: (e) => errors.push(e) });
      if (errors.length) notes.push(...[...new Set(errors)]);
      if (!results.length && !errors.length) notes.push("لا نتائج (هل نُفّذت migration 20261007_islamqa_fatwas.sql واكتمل الاستيراد من /api/admin/import-islamqa؟)");
      return { results, notes };
    }
    case "qp_fatwas": {
      const raw: RawTrace[] = [];
      const res = await Promise.all(qs.map((q) => fetchFatwas(q, raw)));
      const excluded = [...new Set(res.flatMap((r) => r.excluded))];
      if (excluded.length) notes.push(`نطاقات مستبعدة (خارج المرجعية): ${excluded.join("، ")}`);
      return { results: uniqueByUrl(res.flatMap((r) => r.fatwas.map(fatwaResult))), notes, raw };
    }
    case "qp_topics":
    case "qp_books": {
      const raw: RawTrace[] = [];
      const kind = id === "qp_topics" ? "topics" : "books";
      const res = await Promise.all(qs.map((q) => fetchItems(q, kind, raw)));
      return { results: uniqueByUrl(res.flatMap((r) => r.items)), notes, raw };
    }
    case "qp_tafsir": {
      const v = verseOf(question);
      if (!v) return noVerse();
      const raw: RawTrace[] = [];
      notes.push(`الآية ${v.surah}:${v.ayah} (الميسر ثم السعدي ثم ابن كثير ثم الطبري)`);
      return { results: await fetchAyahTafsir(v.surah, v.ayah, raw), notes, raw };
    }
    case "qp_translation": {
      const v = verseOf(question);
      if (!v) return noVerse();
      const raw: RawTrace[] = [];
      notes.push(`الآية ${v.surah}:${v.ayah} باللغة ${lang}`);
      return { results: await fetchAyahTranslation(v.surah, v.ayah, lang, raw), notes, raw };
    }
    case "mcp_tools": {
      const tools = await listTools();
      const { all, extra } = await mcpSearchSources().catch(() => ({ all: [] as string[], extra: [] as string[] }));
      notes.push(`قيم sources في search: ${all.join("، ") || "—"}`, `المجموعات الإضافية المستعملة: ${extra.join("، ") || "لا شيء"}`);
      return { results: [], notes, tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) };
    }
    case "mcp_hadith":
      return { results: await each((q) => search("hadeethenc", q, "ar", 26_000)), notes };
    case "mcp_quran":
      return { results: await each((q) => search("quranenc", q, lang, 26_000)), notes };
    case "mcp_verses": {
      const v = verseOf(question);
      if (!v) return noVerse();
      notes.push(`الآية ${v.surah}:${v.ayah}`);
      const items = await mcpQuranVerses(v.surah, v.ayah, lang);
      return {
        results: items.map((it) => ({ ...it, text: stripMcpChrome(it.text), source: "موسوعة القرآن الكريم (MCP)", sourceId: "quranenc" as const, lang: it.lang ?? lang })),
        notes,
      };
    }
    case "mcp_library": {
      // التصنيفات، ثم رمز اللغة من list_languages، ثم 3 تركيبات لـ browse_library برد كل منها.
      const raw: RawTrace[] = [];
      const trace = (tool: string, args: Record<string, unknown>, data: unknown, text: string) =>
        raw.push(mcpTrace(`${tool} ${JSON.stringify(args)}`, data, text));
      const tool = await findTool("browse_library");
      if (!tool) return { results: [], notes: ["الأداة browse_library غير موجودة"], skipped: true };
      notes.push(`inputSchema: ${JSON.stringify({ properties: tool.inputSchema.properties, required: tool.inputSchema.required })}`.slice(0, 900));
      const cats = await mcpLibraryCategories(lang, trace).catch((e) => {
        notes.push(`list_library_categories: ${String((e as Error).message).slice(0, 160)}`);
        return [];
      });
      notes.push(`التصنيفات (${cats.length}): ${cats.slice(0, 12).map((c) => `${c.id}=${c.title}`).join("، ")}`);
      const category = bestCategory(qs[0], cats) ?? cats[0] ?? null;
      const code = await mcpLibraryLanguage(lang).catch((e) => {
        notes.push(`list_languages: ${String((e as Error).message).slice(0, 160)}`);
        return null;
      });
      notes.push(`التصنيف المختار: ${category ? `${category.id}=${category.title}` : "—"} · رمز اللغة: ${code ?? "— (لا list_languages أو لا مطابق)"}`);
      const items: SourceResult[] = [];
      for (const args of libraryArgCombos(tool, category?.id ?? null, code, qs[0])) {
        try {
          const r = await callTool(tool.name, args, { cacheTtlMs: 0 });
          const text = toolText(r);
          trace(tool.name, args, toolData(r), text);
          const found = collectItems(toolData(r), 8, undefined, undefined, { lang });
          notes.push(`${JSON.stringify(args)} ← ${found.length} نتيجة`);
          items.push(...found.map((it) => ({ ...it, source: "IslamHouse (MCP)", sourceId: "islamhouse" as const, lang: it.lang ?? lang })));
        } catch (e) {
          raw.push({ path: `${tool.name} ${JSON.stringify(args)}`, keys: [], head: "", error: String((e as Error).message).slice(0, 200) });
        }
      }
      return { results: uniqueByUrl(items), notes, raw };
    }
    case "mcp_library_search":
      return {
        results: await each(async (q) =>
          (await mcpSearch(q, "ar", "library")).map((it) => ({ ...it, source: "IslamHouse (MCP search)", sourceId: "islamhouse" as const, lang: it.lang ?? "ar" })),
        ),
        notes,
      };
    case "mcp_extra": {
      const { extra } = await mcpSearchSources();
      if (!extra.length) return { results: [], notes: ["الخادم لا يعلن مجموعات بحث غير القرآن والحديث والمكتبة."], skipped: true };
      notes.push(`المجموعات: ${extra.join("، ")}`);
      const items = (await Promise.all(extra.slice(0, 3).map((v) => mcpSearchExtra(qs[0], lang, v).catch(() => [])))).flat();
      return {
        results: uniqueByUrl(items.map((it) => ({ ...it, source: `MCP (${new URL(it.url).hostname})`, sourceId: "islamenc" as const, lang: it.lang ?? lang }))),
        notes,
      };
    }
    case "bayyinat":
      return { results: await bayyinat(question), notes: ["العبارة: نص السؤال كما كُتب (search_bayyinat)"] };
    case "basics": {
      const entries = matchBasics(question);
      notes.push(entries.length ? `المطابق: ${entries.map((e) => e.id).join("، ")}` : "لا مطابق");
      return {
        results: entries.map((e) => ({
          title: e.id,
          text: clip(`آيات: ${e.verses.join("، ") || "—"} · أحاديث: ${e.hadithQueries.join("، ") || "—"} · بيّنات: ${e.bayyinat.join("، ") || "—"}`, 400),
          url: "https://mustafti.com",
          source: "data/basics.json",
          sourceId: "quranenc" as const,
          lang: "ar",
        })),
        notes,
      };
    }
    case "dorar": {
      const res = await Promise.all(qs.map((q) => fetchDorar(q)));
      notes.push(`كتل الحديث في الـ HTML: ${res.map((r) => r.rawBlocks).join(" + ")} · حجمه: ${res.map((r) => r.htmlChars).join(" + ")} حرفاً`);
      return { results: uniqueByUrl(res.flatMap((r) => r.hadiths.map(dorarResult))), notes };
    }
  }
}
