import "server-only";

import { matchBasics, verseRefsInText } from "@/lib/brain/basics";
import { explicitVerseRef } from "@/lib/brain/quran-index";
import { clip } from "./html";
import { mcpLibrary, mcpQuranVerses } from "./mcp-search";
import { fetchAyahTafsir, fetchAyahTranslation, fetchFatwas, fetchItems, fatwaResult } from "./quranpedia";
import { dorarResult, fetchDorar } from "./dorar";
import { search } from "./index";
import type { SourceResult } from "./types";

/**
 * صفحة فحص المصادر للمشرف (/api/admin/sources-probe): كل مصدر على حدة، بسؤال يكتبه المشرف،
 * بلا ذاكرة مؤقتة لمصادر HTTP (لقياس الزمن الحقيقي). بيئة التطوير لا تصل إلى الإنترنت، فهذه
 * الصفحة هي طريقة فحص الموصّلات حياً: الحالة، والزمن، وأول 3 نتائج، ومفاتيح الرد الخام.
 */

export type ProbeSourceId =
  | "mcp_hadith"
  | "mcp_quran"
  | "mcp_verses"
  | "mcp_library"
  | "bayyinat"
  | "basics"
  | "qp_fatwas"
  | "qp_topics"
  | "qp_books"
  | "qp_tafsir"
  | "qp_translation"
  | "dorar";

export const PROBE_SOURCES: { id: ProbeSourceId; label: string; deadlineMs: number }[] = [
  { id: "qp_fatwas", label: "Quranpedia — فتاوى منشورة (نطاقات المرجعية فقط)", deadlineMs: 8_000 },
  { id: "dorar", label: "الدرر السنية — الموسوعة الحديثية (dorar_api.json)", deadlineMs: 8_000 },
  { id: "qp_tafsir", label: "Quranpedia — تفسير آية (من السؤال، أو 2:255)", deadlineMs: 12_000 },
  { id: "qp_translation", label: "Quranpedia — ترجمة معنى آية بلغة السؤال", deadlineMs: 8_000 },
  { id: "qp_topics", label: "Quranpedia — موضوعات", deadlineMs: 8_000 },
  { id: "qp_books", label: "Quranpedia — كتب", deadlineMs: 8_000 },
  { id: "mcp_hadith", label: "MCP — search (الحديث) + fetch للدرجة", deadlineMs: 26_000 },
  { id: "mcp_quran", label: "MCP — search (القرآن)", deadlineMs: 26_000 },
  { id: "mcp_verses", label: "MCP — get_quran_verses (آية من السؤال، أو 2:255)", deadlineMs: 15_000 },
  { id: "mcp_library", label: "MCP — browse_library (IslamHouse)", deadlineMs: 15_000 },
  { id: "bayyinat", label: "بيّنات (Supabase)", deadlineMs: 8_000 },
  { id: "basics", label: "الأساسيات (data/basics.json)", deadlineMs: 2_000 },
];

export type ProbeOutcome = {
  results: SourceResult[];
  /** ما يساعد على ضبط القراءة: مفاتيح الرد الخام، والنطاقات المستبعدة، وما استُعمل من عبارات. */
  notes: string[];
};

function verseOf(question: string): { surah: number; ayah: number; given: boolean } {
  const ref = explicitVerseRef(question) ?? verseRefsInText(question)[0];
  return ref ? { surah: ref.surah, ayah: ref.ayah, given: true } : { surah: 2, ayah: 255, given: false };
}

const uniqueByUrl = (xs: SourceResult[]) => [...new Map(xs.map((x) => [x.url, x])).values()];

/** يشغّل مصدراً واحداً بعبارات البحث (أول عبارتين). يرمي عند الفشل. */
export async function runProbeSource(
  id: ProbeSourceId,
  question: string,
  queries: string[],
  lang: string,
  bayyinat: (q: string) => Promise<SourceResult[]>,
): Promise<ProbeOutcome> {
  const qs = (queries.length ? queries : [question]).slice(0, 2);
  const notes: string[] = [`العبارات: ${qs.join(" · ")}`];
  const each = async (fn: (q: string) => Promise<SourceResult[]>) => uniqueByUrl((await Promise.all(qs.map(fn))).flat());

  switch (id) {
    case "qp_fatwas": {
      const res = await Promise.all(qs.map((q) => fetchFatwas(q)));
      const excluded = [...new Set(res.flatMap((r) => r.excluded))];
      if (excluded.length) notes.push(`نطاقات مستبعدة (خارج المرجعية): ${excluded.join("، ")}`);
      if (res[0]?.shape.length) notes.push(`مفاتيح الرد: ${res[0].shape.join(", ")}`);
      return { results: uniqueByUrl(res.flatMap((r) => r.fatwas.map(fatwaResult))), notes };
    }
    case "qp_topics":
    case "qp_books": {
      const kind = id === "qp_topics" ? "topics" : "books";
      const res = await Promise.all(qs.map((q) => fetchItems(q, kind)));
      if (res[0]?.shape.length) notes.push(`مفاتيح الرد: ${res[0].shape.join(", ")}`);
      return { results: uniqueByUrl(res.flatMap((r) => r.items)), notes };
    }
    case "qp_tafsir": {
      const v = verseOf(question);
      notes.push(`الآية ${v.surah}:${v.ayah}${v.given ? "" : " (افتراضية: لا آية في السؤال)"}`);
      return { results: await fetchAyahTafsir(v.surah, v.ayah), notes };
    }
    case "qp_translation": {
      const v = verseOf(question);
      notes.push(`الآية ${v.surah}:${v.ayah} باللغة ${lang}`);
      return { results: await fetchAyahTranslation(v.surah, v.ayah, lang), notes };
    }
    case "dorar": {
      const res = await Promise.all(qs.map((q) => fetchDorar(q)));
      notes.push(`كتل الحديث في الـ HTML: ${res.map((r) => r.rawBlocks).join(" + ")} · حجمه: ${res.map((r) => r.htmlChars).join(" + ")} حرفاً`);
      return { results: uniqueByUrl(res.flatMap((r) => r.hadiths.map(dorarResult))), notes };
    }
    case "mcp_hadith":
      return { results: await each((q) => search("hadeethenc", q, "ar", 26_000)), notes };
    case "mcp_quran":
      return { results: await each((q) => search("quranenc", q, lang, 26_000)), notes };
    case "mcp_verses": {
      const v = verseOf(question);
      notes.push(`الآية ${v.surah}:${v.ayah}${v.given ? "" : " (افتراضية)"}`);
      const items = await mcpQuranVerses(v.surah, v.ayah, lang);
      return {
        results: items.map((it) => ({ ...it, source: "موسوعة القرآن الكريم (MCP)", sourceId: "quranenc" as const, lang: it.lang ?? lang })),
        notes,
      };
    }
    case "mcp_library": {
      const items = (await Promise.all(qs.map((q) => mcpLibrary(q, lang)))).flat();
      return {
        results: uniqueByUrl(items.map((it) => ({ ...it, source: "IslamHouse (MCP)", sourceId: "islamhouse" as const, lang: it.lang ?? lang }))),
        notes,
      };
    }
    case "bayyinat":
      return { results: await bayyinat(question), notes: ["العبارة: نص السؤال كما كُتب"] };
    case "basics": {
      const entries = matchBasics(question);
      notes.push(entries.length ? `المطابق: ${entries.map((e) => e.id).join("، ")}` : "لا مطابق");
      return {
        results: entries.map((e) => ({
          title: e.id,
          text: clip(`آيات: ${e.verses.join("، ")} · أحاديث: ${e.hadithQueries.join("، ")} · بيّنات: ${e.bayyinat.join("، ")}`, 400),
          url: "https://mustafti.com",
          source: "data/basics.json",
          sourceId: "quranenc" as const,
          lang: "ar",
        })),
        notes,
      };
    }
  }
}
