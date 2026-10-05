import "server-only";

import { z } from "zod";
import { cached, DAY } from "@/lib/cache";
import { chatJson, reasoningFor } from "@/lib/llm";
import { callTool, toolData, toolText } from "@/lib/mcp";
import { search, type SourceId, type SourceResult } from "@/lib/sources";
import { clip, htmlToText } from "@/lib/sources/html";
import { findTool, mcpQuranRange, mcpSearch, mcpSearchAny, mcpSearchExtra, mcpSearchSources, type McpItem } from "@/lib/sources/mcp-search";
import { SOURCE_BY_ID } from "@/lib/sources/registry";
import { searchIslamqaLocal, type IslamqaQuery } from "@/lib/sources/islamqaLocal";
import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";
import { matchBasics, parseVerseRef, quotedVerses, verseRefsInText, type VerseRef } from "./basics";
import type { Classification } from "./classify";
import { isEmptyPlan, type CitationPlan } from "./plan";
import { basicsLimit, modeWantsLibrary, rankBonus, sourceBoost, sourceOrder, type ChatMode } from "./modes";
import { findTerms } from "./glossary";
import {
  applyScores,
  clean,
  cleanToolText,
  focusExcerpt,
  keywordScore,
  keywords,
  overlap,
  prerank,
  RELEVANCE_MAX,
  RELEVANCE_MIN,
  rerankList,
  STOP,
  type Candidate as RankCandidate,
} from "./rank";
import { MAX_FATWA_CARDS, toFatwaCard, type FatwaCard } from "./fatwa-cards";
import { webLayer, type WebMode, type WebResult } from "./web";
import { isFatwaDomain, urlKey, type WebSource } from "./web-parse";
import { explicitVerseRef, INDEX_SOURCE, indexSummaryLine, isValidVerse, parseVerseText, surahInfoLine, surahUrl, verseTitle } from "./quran-index";
import { matchKey } from "./guard";
import type { Passage } from "./prompts";

/**
 * الاسترجاع لمُستفتي: من البحث إلى النصوص التي تُرسل للصياغة.
 *
 *  1) عبارات البحث: 2–4 عبارات عربية قصيرة يصوغها المصنّف (+ عبارة بلغة السائل).
 *  2) البحث المتوازي في المصادر المناسبة لنوع السؤال: MCP (الحديث والقرآن) + «بيّنات» (Supabase)
 *     + الفتاوى المنشورة عبر Quranpedia (نطاقات المرجعية فقط) + الدرر السنية (الحديث بحكمه)
 *     + تفسير Quranpedia لسؤال التفسير عن آية بعينها + قاموس المرجعية. لكل مصدر HTTP مهلة 8 ثوانٍ:
 *     المصدر البطيء يسقط ولا يُنتظر (ويكمل في الخلفية فيملأ الذاكرة للسؤال التالي).
 *  3) الدمج والتنظيف: حذف أوصاف الكتب، وعناصر واجهة المواقع، والمكرر (بالرابط والنص).
 *  4) ترتيب أولي بتداخل الكلمات، مع حصة لكل مصدر حتى لا يطغى مصدر.
 *  5) الإثراء: شرح الحديث ودرجته بأداة get_hadith/fetch.
 *  6) تقييم الصلة بطلب واحد مجمّع للنموذج من 0 إلى 100، ولا يبقى إلا ما بلغ 60.
 *  7) الجواب من النصوص فقط (respond.ts). والفتاوى ذات الصلة تُعرض أيضاً بطاقاتٍ تحت الجواب.
 */

export type Candidate = RankCandidate & {
  sourceId: SourceId | "bayyinat" | "glossary" | "quran-index" | "web";
  fatwa?: SourceResult["fatwa"];
  /** من طبقة «ابحث واقرأ» بلا اقتباس موثَّق: رابط فقط، لا يُرسل للصياغة. */
  linkOnly?: boolean;
  /** من قيّم الصلة: النموذج ضد السؤال الحالي، أو تداخل الكلمات احتياطاً. */
  scoredBy?: "llm" | "keywords";
  pinned?: boolean;
  /** للآيات: نص الآية العربي، وما بعده (التفسير الميسر أو ترجمة المعنى)، للعرض المنظم. */
  verse?: string;
  note?: string;
  noteKind?: "tafsir" | "translation";
};

export type SearchDiag = { query: string; lang: string; source: string; results: number; ms: number; error?: string };

export type RetrievalDiag = {
  queries: { q: string; lang: string }[];
  searches: SearchDiag[];
  retried: boolean;
  /** أعداد كل مرحلة: الخام، وبعد التنظيف، والمرشحون للتقييم، والمقبولون (≥60). */
  counts: { raw: number; cleaned: number; ranked: number; kept: number };
  dropped: { reason: string; source: string; title: string }[];
  /** المرشحون بدرجاتهم (للتشخيص). */
  scored: { source: string; title: string; kw: number; score?: number; enriched: boolean }[];
  rerank: "llm" | "keywords";
  /** «الأساسيات» المطابقة، والآيات المحددة (تُجلب بدرجة 3). */
  basics?: string[];
  verses?: string[];
  /** خطة الإحالات المقترحة، وعدد ما وُجد منها فعلاً في المصادر. */
  plan?: CitationPlan;
  /** خطة إعادة التخطيط (مرة واحدة) إن لم يبلغ أي موضع من الأولى 60. */
  replan?: CitationPlan;
  /** عدد المراجع المحددة التي بلغت تقييم الصلة فعلاً، وسجل كل مرجع (وُجد / فارغ / خطأ / مهلة). */
  pinned?: number;
  pinLog?: PinLog[];
  /** طبقة «ابحث واقرأ»: العبارات، والمقروء، والموثَّق، و«رابط فقط»، والمحذوف، والزمن، والتكلفة. */
  web?: WebDiag;
  /** زمن كل مرحلة (R1d): المصادر السريعة، والتقييم الأول، وانتظار «ابحث واقرأ»، والتقييم الثاني. */
  stages?: RetrievalStages;
};

export type RetrievalStages = {
  /** المصادر السريعة (islamqa المحلية، و«بيّنات»، و«الأساسيات»، وMCP) حتى ~8 ثوانٍ. */
  fastMs: number;
  rerank1Ms: number;
  /** وُجد مصدران ذوا صلة (≥ 60) فلم تُنتظر «ابحث واقرأ». */
  earlyExit: boolean;
  /** «ابحث واقرأ» كانت قد انتهت عند التقييم الأول. */
  webInRound1: boolean;
  waitMs?: number;
  rerank2Ms?: number;
  /** الجولات اللاحقة (إعادة التخطيط). */
  laterMs?: number;
};

export type WebDiag = {
  queries: string[];
  read: number;
  verified: number;
  linkOnly: number;
  dropped: number;
  ms: number;
  costUsd: number | null;
  /** من البحث وحده (القراءة تأخرت أو لم تُعِد شيئاً). */
  searchOnly?: boolean;
  /** لم يُعِد النموذج JSON: أُعيد الطلب قصيراً (retried)، أو استُعمل المحتوى المقروء (pages). */
  jsonRecovery?: "retried" | "pages";
  /** مصادر بنص الصفحة يقتطعه الكود (extracted)، وبمقتطف البحث (snippet). */
  extracted?: number;
  snippets?: number;
  error?: string;
};

/**
 * مصادر البحث الآلي: منصات الجمعية عبر MCP. بيان الإسلام ورسالة الحرمين والإسلام سؤال وجواب
 * صارت «رابط فقط» لأن بحثها يعيد النتائج نفسها مهما كان السؤال، وIslamHouse لأن بحث
 * المكتبة وbrowse_library يتجاوزان المهلة ويضاعفان زمن الرد (registry.ts).
 */
export const RETRIEVAL_SOURCES: SourceId[] = ["hadeethenc", "quranenc"];
/** حد كلمات البحث لكل مصدر (تخفيف الضغط على خادم MCP، ورد 429). */
export const MAX_QUERIES_PER_SOURCE = 2;
/** مهلة كل مصدر: المهلة الموحدة 6 ثوانٍ (S5، للسرعة). */
/** مهلة البحث لكل مصدر: استدعاء MCP (12 ث) وإعادته مرة. الانتظار أفضل من الامتناع. */
const SEARCH_DEADLINE_MS = 26_000;
/** ميزانية الاسترجاع الافتراضية؛ respond.ts يمرر ما بقي من ميزانية السؤال (40 ث). */
export const RETRIEVAL_BUDGET_MS = 32_000;
const RERANK_POOL = 16;
const MAX_PASSAGES = 6;
/** أقل درجة صلة (من 100) لما يُرسل إلى الصياغة ويُعرض. */
const MIN_SCORE = RELEVANCE_MIN;
/** «نصوص ذات صلة» عند الامتناع: ما بين 40 و59 (قريب من السؤال ولا يكفي لجوابه). */
const RELATED_MIN = 40;
/** أقصى عدد للفتاوى بين النصوص المرسلة للصياغة (ليبقى مكان للآيات والأحاديث). */
const MAX_FATWA_PASSAGES = 2;
/** مهلة كل مصدر HTTP (Quranpedia والدرر): ما تأخر يسقط ولا يُنتظر. */
export const EXTRA_DEADLINE_MS = 8_000;
const PASSAGE_CHARS = 1400;
/** مهلة إثراء كل نص بشرحه (مستقلة عن البحث). */
const ENRICH_MS = 6_000;
const BAYYINAT_URL = "https://dawa.center/file/7937";

// ---------------------------------------------------------------------------
// كلمات البحث
// ---------------------------------------------------------------------------

/** كلمات البحث بالحروف الأصلية. */
function queryWords(text: string): string[] {
  return text.split(/[^\p{L}\p{N}\p{M}]+/u).filter((w) => w.length > 2 && !STOP.test(matchKey(w)));
}

export function buildQueries(c: Classification, question: string): { q: string; lang: string }[] {
  const out: { q: string; lang: string }[] = [];
  const add = (q: string, lang: string) => {
    const t = q.trim().slice(0, 120);
    if (t && !out.some((x) => x.q === t && x.lang === lang)) out.push({ q: t, lang });
  };
  // الأولى عربية، والثانية بلغة السائل إن لم يكن عربياً، ثم الاحتياط إن نقص العدد.
  c.searchQueries.ar.slice(0, 1).forEach((q) => add(q, "ar"));
  if (c.lang !== "ar") c.searchQueries.userLang.slice(0, 1).forEach((q) => add(q, c.lang));
  c.searchQueries.ar.slice(1, 3).forEach((q) => add(q, "ar"));
  for (const t of findTerms(question).slice(0, 2)) add(t.term_ar, "ar");
  const kw = queryWords(question).slice(0, 5).join(" ");
  if (kw) add(kw, c.lang);
  return out.slice(0, MAX_QUERIES_PER_SOURCE);
}

// ---------------------------------------------------------------------------
// البحث
// ---------------------------------------------------------------------------

function fromSource(r: SourceResult): Candidate {
  return {
    title: r.title,
    text: r.text,
    url: r.url,
    source: r.source,
    sourceId: r.sourceId,
    grade: r.grade,
    lang: r.lang,
    ref: r.ref,
    ...(r.fatwa ? { fatwa: r.fatwa } : {}),
  };
}

async function searchSources(
  queries: { q: string; lang: string }[],
  diag: SearchDiag[],
  sources: SourceId[] = RETRIEVAL_SOURCES,
  deadlineMs = SEARCH_DEADLINE_MS,
): Promise<Candidate[]> {
  const one = async (source: SourceId, q: string, lang: string) => {
    const t0 = Date.now();
    const errors: string[] = [];
    const results = await search(source, q, lang, deadlineMs, (e) => errors.push(e)).catch((e) => {
      errors.push(String((e as Error)?.message ?? e));
      return [];
    });
    diag.push({ query: q, lang, source, results: results.length, ms: Date.now() - t0, ...(errors.length ? { error: errors.join(" | ").slice(0, 300) } : {}) });
    return results.map(fromSource);
  };
  // كل استدعاء MCP محدود بـ 12 ثانية وإعادة واحدة و3 طلبات متزامنة (lib/mcp.ts).
  const jobs = sources.map((source) => Promise.all(queries.map(({ q, lang }) => one(source, q, lang))).then((r) => r.flat()));
  return (await Promise.all(jobs)).flat();
}

/**
 * «بيّنات» عبر الدالة public.search_bayyinat(q, n) في Supabase (أي كلمة مع تشابه الحروف).
 * تُمرَّر لها صيغة السؤال كما كتبها السائل إن كانت عربية، وإلا كلمات البحث العربية.
 */
export async function searchBayyinat(q: string, diag: SearchDiag[], n = 5): Promise<Candidate[]> {
  if (!isAdminClientConfigured() || !q.trim()) return [];
  const t0 = Date.now();
  const { data, error } = await createAdminClient().rpc("search_bayyinat", { q: q.trim().slice(0, 300), n });
  const rows = (Array.isArray(data) ? data : []) as BayyinatRow[];
  diag.push({
    query: q.slice(0, 80),
    lang: "ar",
    source: "bayyinat",
    results: rows.length,
    ms: Date.now() - t0,
    ...(error ? { error: `search_bayyinat: ${error.message}`.slice(0, 300) } : {}),
  });
  if (error) console.warn("search_bayyinat:", error.message);
  return rows.map(bayyinatCandidate);
}

type BayyinatRow = { number: number; question: string; answer: string; page: number | null; source_url: string | null; score?: number };

/** صف «بيّنات» مرشحاً: «بيّنات — السؤال رقم N، ص P»، بلا الأقواس الفارغة ﴿ ﴾. */
function bayyinatCandidate(row: BayyinatRow): Candidate {
  const label = `بيّنات — السؤال رقم ${row.number}${row.page ? `، ص ${row.page}` : ""}`;
  const question = String(row.question).replace(/﴿\s*﴾/g, "").trim();
  return {
    title: `${label}: ${question}`,
    text: `${question}\n${String(row.answer)}`.replace(/﴿\s*﴾/g, "").replace(/[ \t]+/g, " ").trim(),
    // علامة # برقم السؤال: الرابط نفسه لكل الأجوبة، فلا يحذفها التنظيف مكرراً.
    url: `${row.source_url || BAYYINAT_URL}#${row.number}`,
    source: label,
    sourceId: "bayyinat",
    lang: "ar",
  };
}

/** قاموس المرجعية (ص 7) نصاً معتمداً للمصطلحات الواردة في السؤال (التوحيد، الشريعة…). */
export function glossaryCandidates(question: string): Candidate[] {
  return findTerms(question).map((t) => ({
    title: `${t.term_ar} — ${t.en}`,
    text: `${t.term_ar} (${t.en}): ${t.usage_ar}`,
    url: "https://terminologyenc.com",
    source: "المرجعية العلمية — قاموس المصطلحات الأساسية",
    sourceId: "glossary" as const,
    lang: "ar",
    score: RELEVANCE_MAX,
  }));
}

// ---------------------------------------------------------------------------
// الإثراء: المحتوى لا العنوان
// ---------------------------------------------------------------------------

/** أول قيمة نصية لأحد المفاتيح في أي عمق. */
function deepPick(node: unknown, keys: string[], depth = 0): string | undefined {
  if (!node || typeof node !== "object" || depth > 5) return undefined;
  if (Array.isArray(node)) {
    for (const n of node) {
      const v = deepPick(n, keys, depth + 1);
      if (v) return v;
    }
    return undefined;
  }
  const o = node as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    if (keys.includes(k.toLowerCase()) && typeof o[k] === "string" && (o[k] as string).trim()) return (o[k] as string).trim();
  }
  for (const v of Object.values(o)) {
    const found = deepPick(v, keys, depth + 1);
    if (found) return found;
  }
  return undefined;
}

type FetchDoc = { text?: string; segments?: { kind?: string; label?: string; text: string }[] };

const GRADE_RE = /(?:Grade|Hadith grade|الدرجة|درجة الحديث|الحكم|Derecesi|Degré|درجہ|Derajat)\s*[:：]\s*([^\n|]{2,60})/i;

/**
 * تفاصيل نتيجة MCP بمعرّفها الكامل من search (مثل "hadith:66212:ar"): fetch أولاً، ثم
 * get_hadith / get_library_item بالرقم.
 * معطيات الأداة من مخططها (اسم حقل المعرّف ونوعه). يُخزَّن 24 ساعة.
 */
export function mcpDetail(ref: string, lang: string, kind: "hadith" | "library"): Promise<{ text: string; grade?: string } | null> {
  return cached(`brain:detail:${kind}:${lang}:${ref}`, DAY, async () => {
    const names = kind === "hadith" ? ["fetch", "get_hadith"] : ["fetch", "get_library_item"];
    for (const name of names) {
      const tool = await findTool(name);
      const props = tool?.inputSchema.properties ?? {};
      const keys = Object.keys(props);
      const idKey =
        keys.find((k) => /^(id|ref|hadith_id|hadeeth_id|item_id|library_id|document_id|doc_id)$/i.test(k)) ??
        keys.find((k) => /id$/i.test(k));
      if (!tool || !idKey) continue;
      const numeric = props[idKey]?.type === "integer" || props[idKey]?.type === "number";
      const digits = ref.match(/\d+/)?.[0];
      const args: Record<string, unknown> = { [idKey]: numeric ? Number(digits) : name === "fetch" ? ref : (digits ?? ref) };
      if (numeric && !digits) continue;
      const langKey = keys.find((k) => /^(language|lang|locale)$/i.test(k));
      if (langKey) args[langKey] = lang;
      try {
        const result = await callTool(name, args);
        if (result.isError) continue;
        const data = toolData(result);
        const raw = toolText(result);
        // fetch: {id, title, text, segments:[{kind, label, text}]} — text فيه الرواية والراوي والدرجة والشرح.
        const doc = data && typeof data === "object" && !Array.isArray(data) ? (data as FetchDoc) : null;
        const gradeSeg = doc?.segments?.find((x) => /^grade$/i.test(x.label ?? ""))?.text;
        let body = "";
        if (doc && typeof doc.text === "string" && doc.text.trim()) body = doc.text;
        else if (kind === "hadith") {
          const explanation = deepPick(data, ["explanation", "sharh", "explanation_text", "commentary"]);
          if (explanation) body = [deepPick(data, ["hadeeth", "hadith", "arabic_text", "content"]), explanation].filter(Boolean).join("\n");
        } else body = deepPick(data, ["description", "summary", "content", "body"]) ?? "";
        // بلا بيانات منظمة: النص الكامل بعد تنظيف فواصل الخادم وتعليماته.
        const text = clip(htmlToText(cleanToolText(body || raw).replace(/\n+/g, " \n ")), PASSAGE_CHARS);
        const grade =
          gradeSeg?.trim() ??
          deepPick(data, ["grade", "hadith_grade", "grade_ar", "hukm", "degree", "authenticity"]) ??
          (body || raw).match(GRADE_RE)?.[1]?.trim();
        if (text.length > 20) return { text, grade };
      } catch {
        /* الأداة التالية */
      }
    }
    // لا يُخزَّن الفشل (انقطاع مؤقت مثلاً): يُرمى فلا يحفظه cached، ويعيد المتصل null.
    throw new Error(`no detail for ${ref}`);
  }).catch(() => null);
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p.catch(() => fallback), new Promise<T>((r) => (timer = setTimeout(() => r(fallback), ms)))]).finally(() =>
    clearTimeout(timer),
  );
}

/**
 * يثري أعلى المرشحين بمحتواهم بالتوازي: 3 أحاديث (نص + شرح + درجة).
 * لكل نص مهلته المستقلة؛ إن تأخر بقي المرشح بعنوانه ونصه المختصر ولا يضيع.
 */
async function enrich(cands: Candidate[], lang: string): Promise<Candidate[]> {
  const quota: Partial<Record<Candidate["sourceId"], number>> = { hadeethenc: 3 };
  const used: Partial<Record<Candidate["sourceId"], number>> = {};
  return Promise.all(
    cands.map(async (c) => {
      const n = used[c.sourceId] ?? 0;
      if (n >= (quota[c.sourceId] ?? 0)) return c;
      used[c.sourceId] = n + 1;
      if (c.sourceId === "hadeethenc" && (c.ref || c.url)) {
        const ref = c.ref ?? c.url.match(/\/(\d{3,})/)?.[1];
        if (!ref) return c;
        const d = await withTimeout(mcpDetail(ref, c.lang ?? lang, "hadith"), ENRICH_MS, null);
        return d ? { ...c, text: d.text, grade: c.grade ?? d.grade, enriched: true } : c;
      }
      return c;
    }),
  );
}

// ---------------------------------------------------------------------------
// المراجع المحددة: خطة الإحالات (planner.ts)، والآيات المذكورة في السؤال، و«الأساسيات» احتياطاً.
// كلها تُجلب من المصدر نفسه، وما لا وجود له يسقط، والباقي يمر بتقييم الصلة كغيره.
// ---------------------------------------------------------------------------


/**
 * مصادر المراجع المحددة. قابلة للاستبدال في الاختبار المحلي (tests/retrieval.test.ts) بلا شبكة.
 */
export type PinDeps = {
  quranRange: (surah: number, ayah: number, through: number | undefined, lang: string) => Promise<McpItem[]>;
  searchCorpus: (q: string, lang: string, corpus: "hadith" | "library" | "quran") => Promise<McpItem[]>;
  searchAny: (q: string, lang: string) => Promise<(McpItem & { corpus: string })[]>;
  detail: (ref: string, lang: string, kind: "hadith" | "library") => Promise<{ text: string; grade?: string } | null>;
  bayyinatSearch: (q: string) => Promise<Candidate[]>;
  bayyinatNumbers: (numbers: number[]) => Promise<Candidate[]>;
  /** مصادر HTTP بالواجهة الموحدة (Quranpedia والدرر)، بمهلة المصدر. */
  sourceSearch?: (id: SourceId, q: string, lang: string, ms: number, onError: (e: string) => void) => Promise<SourceResult[]>;
  /** طبقة «ابحث واقرأ» (أدوات OpenRouter). */
  web?: (question: string, opts: { mode: WebMode; lang: string; phrases: string[]; timeoutMs: number }) => Promise<WebResult>;
  /** «الإسلام سؤال وجواب» المحلية (جدول islamqa_fatwas). */
  islamqa?: (queries: IslamqaQuery[], lang: string, terms: string[], onError: (e: string) => void) => Promise<SourceResult[]>;
  /** مجموعات بحث MCP الإضافية (أسئلة وأجوبة islamenc، وفتاوى IslamHouse) إن أعلنها الخادم. */
  mcpExtra?: (q: string, lang: string) => Promise<SourceResult[]>;
};

export const DEFAULT_PIN_DEPS: PinDeps = {
  quranRange: mcpQuranRange,
  searchCorpus: mcpSearch,
  searchAny: mcpSearchAny,
  detail: mcpDetail,
  bayyinatSearch: (q) => searchBayyinat(q, [], 3),
  bayyinatNumbers: (ns) => bayyinatByNumber(ns),
  sourceSearch: (id, q, lang, ms, onError) => search(id, q, lang, ms, onError),
  web: webLayer,
  mcpExtra: defaultMcpExtra,
  islamqa: (queries, lang, terms, onError) => searchIslamqaLocal(queries, lang, terms, { onError }),
};

/** مجموعات search الإضافية كما يعلنها الخادم (حتى اثنتين)، بنتائجها منسوبة إلى منصتها. */
async function defaultMcpExtra(q: string, lang: string): Promise<SourceResult[]> {
  const { extra } = await mcpSearchSources();
  if (!extra.length) return [];
  const lists = await Promise.all(extra.slice(0, 2).map((v) => mcpSearchExtra(q, lang, v).catch(() => [] as McpItem[])));
  return lists
    .flat()
    .slice(0, 8)
    .map((it) => {
      const id: SourceId = /islamhouse\.com/.test(it.url) ? "islamhouse" : "islamenc";
      return { title: it.title, text: it.text, url: it.url, source: SOURCE_BY_ID[id].name, sourceId: id, lang: it.lang ?? lang, ...(it.ref ? { ref: it.ref } : {}) };
    });
}

/** سجل كل مرجع محدد: وُجد، أو فارغ، أو خطأ، أو تجاوز المهلة (يظهر في brain-test). */
export type PinLog = { ref: string; status: "ok" | "empty" | "error" | "timeout"; count: number; detail?: string };

async function track<T extends Candidate | Candidate[] | null>(
  log: PinLog[],
  ref: string,
  job: () => Promise<T>,
  ms: number,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      job(),
      new Promise<"timeout">((r) => (timer = setTimeout(() => r("timeout"), ms))),
    ]);
    if (value === "timeout") {
      log.push({ ref, status: "timeout", count: 0, detail: `${ms}ms` });
      return null;
    }
    const count = Array.isArray(value) ? value.length : value ? 1 : 0;
    log.push({ ref, status: count ? "ok" : "empty", count });
    return value;
  } catch (error) {
    log.push({ ref, status: "error", count: 0, detail: String((error as Error)?.message ?? error).slice(0, 200) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * نص آية أو آيات من get_quran_verses وحدها: العربي + التفسير الميسر أو ترجمة لغة السائل.
 * اسم السورة من «فهرس سور المصحف» (quran-index) لا من نص الرد: التفسير قد يذكر سورة أخرى
 * («سبق الكلام عليها في أول سورة البقرة» في تفسير آل عمران 1).
 */
async function verseCandidate(ref: VerseRef, lang: string, deps: PinDeps): Promise<Candidate | null> {
  if (!isValidVerse(ref.surah, ref.ayah)) return null;
  const item = (await deps.quranRange(ref.surah, ref.ayah, ref.through, lang))[0];
  if (!item) return null;
  const parsed = parseVerseText(item.text);
  const title = verseTitle(ref.surah, ref.ayah, ref.through);
  const noteKind = lang === "ar" ? "tafsir" : "translation";
  const noteLabel = noteKind === "tafsir" ? "التفسير الميسر" : "ترجمة المعنى";
  let verse: string;
  let note: string;
  if (parsed.verses.length) {
    const many = parsed.verses.length > 1;
    verse = parsed.verses.map((v) => `${v.arabic}${many ? ` (${v.ayah})` : ""}`).join(" ");
    note = parsed.verses.map((v) => (many && v.note ? `(${v.ayah}) ${v.note}` : v.note)).filter(Boolean).join(" ");
  } else {
    // صيغة غير متوقعة: النص بعد تنظيف علامات الخادم، بلا تقسيم.
    verse = cleanToolText(item.text);
    note = "";
  }
  if (verse.length < 2) return null;
  const text = `﴿${verse}﴾ [${title}]${note ? `\n${noteLabel}: ${note}` : ""}`;
  return {
    title,
    text: clip(text, PASSAGE_CHARS),
    url: parsed.sourceUrl ?? item.url ?? surahUrl(ref.surah, ref.ayah),
    source: `${SOURCE_BY_ID.quranenc.name} — ${title}`,
    sourceId: "quranenc",
    lang,
    kw: 0,
    enriched: true,
    verse,
    note: note || undefined,
    noteKind: note ? noteKind : undefined,
  };
}

/**
 * تعريف سورة من «فهرس سور المصحف» وحده: «سورة آل عمران — رقم 3 في ترتيب المصحف — عدد آياتها
 * 200 — مدنية». لا يحتاج الشبكة؛ أول آياتها تُطلب مرجعاً مستقلاً (verseCandidate).
 */
export function surahInfoCandidate(surah: number): Candidate | null {
  const line = surahInfoLine(surah);
  if (!line) return null;
  return {
    title: line.split(" — ")[0],
    text: line,
    url: surahUrl(surah),
    source: INDEX_SOURCE,
    sourceId: "quran-index",
    lang: "ar",
    kw: 0,
    enriched: true,
  };
}

/** الفهرس جملةً: عدد السور وأولها وآخرها ومجموع الآيات («كم عدد سور القرآن»). */
export function quranIndexCandidate(): Candidate {
  return {
    title: INDEX_SOURCE,
    text: indexSummaryLine(),
    url: surahUrl(1).replace(/\/1$/, ""),
    source: INDEX_SOURCE,
    sourceId: "quran-index",
    lang: "ar",
    kw: 0,
    enriched: true,
  };
}

/** مواضع آيات من البحث في نص القرآن بعبارة قصيرة (quran_queries)، أعلى نتيجتين. */
async function quranQueryRefs(q: string, deps: PinDeps): Promise<VerseRef[]> {
  const items = await deps.searchCorpus(q, "ar", "quran");
  const refs: VerseRef[] = [];
  for (const it of items) {
    const m = `${it.title} ${it.url} ${it.ref ?? ""}`.match(/(\d{1,3}):(\d{1,3})|\/(\d{1,3})[#/](\d{1,3})/);
    const surah = Number(m?.[1] ?? m?.[3]);
    const ayah = Number(m?.[2] ?? m?.[4]);
    if (isValidVerse(surah, ayah) && !refs.some((r) => r.surah === surah && r.ayah === ayah)) refs.push({ surah, ayah });
    if (refs.length >= 2) break;
  }
  return refs;
}

/**
 * أعلى حديثين لكلمات بحث قصيرة: البحث في مجموعة الحديث بالعربية، فإن عاد فارغاً فبلا تقييد
 * المجموعة (نتائج الحديث منها). ثم الشرح والدرجة بـ fetch، وبلغة السائل إن نُشر الحديث بها.
 */
async function hadithCandidates(q: string, lang: string, deps: PinDeps, max = 2): Promise<Candidate[]> {
  let items = await deps.searchCorpus(q, "ar", "hadith").catch(() => [] as McpItem[]);
  if (!items.length) items = (await deps.searchAny(q, "ar").catch(() => [])).filter((x) => x.corpus === "hadith");
  return Promise.all(
    items.slice(0, max).map(async (it) => {
      const refLang = it.ref && lang !== "ar" ? it.ref.replace(/:[a-z]{2,3}$/, `:${lang}`) : undefined;
      const detail =
        (refLang ? await withTimeout(deps.detail(refLang, lang, "hadith"), ENRICH_MS, null) : null) ??
        (it.ref ? await withTimeout(deps.detail(it.ref, "ar", "hadith"), ENRICH_MS, null) : null);
      return {
        title: it.title,
        text: detail?.text ?? it.text,
        url: it.url,
        source: SOURCE_BY_ID.hadeethenc.name,
        sourceId: "hadeethenc" as const,
        grade: detail?.grade ?? it.grade,
        lang: refLang && detail ? lang : "ar",
        ref: it.ref,
        kw: 0,
        enriched: Boolean(detail),
      };
    }),
  );
}

/** أسئلة «بيّنات» بأرقامها (لاحتياط «الأساسيات» فقط؛ خطة النموذج تبحث بعبارات). */
async function bayyinatByNumber(numbers: number[]): Promise<Candidate[]> {
  if (!numbers.length || !isAdminClientConfigured()) return [];
  const { data } = await createAdminClient()
    .from("bayyinat")
    .select("number, question, answer, page, source_url")
    .in("number", numbers);
  return ((data ?? []) as BayyinatRow[]).map((row) => ({ ...bayyinatCandidate(row), kw: 0 }));
}

/** آيات منقولة بنصها في السؤال (ولو بخطأ): موضعها بالبحث في القرآن. */
async function locateQuotedVerses(c: Classification, question: string, deps: PinDeps): Promise<VerseRef[]> {
  const quoted = quotedVerses(question);
  if (!quoted.length) return [];
  const texts = [...quoted, ...c.searchQueries.ar.slice(0, 1)];
  const located = await Promise.all(
    texts.map(async (t) => {
      const items = await deps.searchCorpus(t, "ar", "quran").catch(() => [] as McpItem[]);
      const want = keywords(t);
      for (const it of items.slice(0, 3)) {
        const m = `${it.title} ${it.url}`.match(/(\d{1,3}):(\d{1,3})|\/(\d{1,3})#(\d{1,3})/);
        const surah = Number(m?.[1] ?? m?.[3]);
        const ayah = Number(m?.[2] ?? m?.[4]);
        const have = new Set(keywords(`${it.title} ${it.text}`));
        const ratio = want.length ? want.filter((w) => have.has(w)).length / want.length : 0;
        if (surah && ayah && ratio >= 0.5) return parseVerseRef(`${surah}:${ayah}`);
      }
      return null;
    }),
  );
  return located.filter((r): r is VerseRef => r !== null);
}

/**
 * المراجع المحددة للسؤال: خطة الإحالات من النموذج (planner.ts) إن لم تكن فارغة، والآيات
 * المذكورة في السؤال برقمها أو بنصها، و«الأساسيات» (data/basics.json) احتياطاً إن كانت الخطة فارغة.
 *
 * هذه المراجع **لا تمر بالتنظيف ولا بإزالة المكرر بالعنوان ولا بحصص المصادر ولا بالترتيب
 * بالكلمات**: تذهب مباشرة إلى تقييم الصلة (rerank) بنصها الكامل (الآية واسم السورة والتفسير أو
 * الترجمة، أو الحديث بدرجته وشرحه). وما لا وجود له في المصدر يسقط، ويُسجَّل سببه في diag.pinLog.
 */
export async function pinnedCandidates(
  c: Classification,
  question: string,
  diag: RetrievalDiag,
  planPromise?: Promise<CitationPlan | null>,
  deps: PinDeps = DEFAULT_PIN_DEPS,
  deadline = Date.now() + RETRIEVAL_BUDGET_MS,
): Promise<Candidate[]> {
  const jobs = pinnedJobs(c, question, diag, planPromise, deps, deadline);
  const [core, quran] = await Promise.all([jobs.core, jobs.quran]);
  return mergePinned([...core, ...quran]);
}

/** المراجع المحددة بلا تكرار (بالرابط)، معلَّمة «محددة» ومقدَّمة عند تساوي الدرجة. */
function mergePinned(out: Candidate[]): Candidate[] {
  return [...new Map(out.map((x) => [x.url, { ...x, kw: 50, pinned: true }])).values()];
}

/**
 * المراجع المحددة في مسارين متوازيين:
 * - core: آيات الخطة والسؤال (بأرقامها أو بذكرها الصريح «الآية الثانية من سورة يونس»)، وتعريف
 *   السورة والفهرس، والأحاديث، و«بيّنات».
 * - quran: البحث بالكلمات في نص القرآن (الآية المنقولة في السؤال، وquran_queries). أبطأ، فلا
 *   يُنتظر إن بلغ مرجع من core 60 (retrieve).
 */
export function pinnedJobs(
  c: Classification,
  question: string,
  diag: RetrievalDiag,
  planPromise: Promise<CitationPlan | null> | undefined,
  deps: PinDeps,
  deadline: number,
  mode: ChatMode = "general",
): { core: Promise<Candidate[]>; quran: Promise<Candidate[]> } {
  const log: PinLog[] = [];
  diag.pinLog = log;
  const left = () => Math.max(500, deadline - Date.now());
  const planP = (planPromise ?? Promise.resolve(null)).catch(() => null);

  const refsP = planP.then((plan) => {
    const usePlan = !isEmptyPlan(plan);
    // «الأساسيات» مع الخطة دائماً (كانت احتياطاً للخطة الفارغة فلا تُستعمل أبداً): المطابق الأول
    // مع خطة، وحتى اثنين بدونها (واثنان دائماً في الوضعين الموجّهين، R3). مراجعها تمر بتقييم الصلة كغيرها.
    const entries = matchBasics(question, basicsLimit(mode, usePlan));
    diag.basics = entries.map((e) => e.id);
    diag.plan = plan ?? undefined;
    const explicit = explicitVerseRef(question);
    const refs: VerseRef[] = [
      ...(explicit ? [explicit] : []),
      ...verseRefsInText(question),
      ...(plan?.quran ?? []),
      ...entries.flatMap((e) => e.verses.map(parseVerseRef).filter((r): r is VerseRef => r !== null)),
    ];
    const unique = [...new Map(refs.map((r) => [`${r.surah}:${r.ayah}:${r.through ?? ""}`, r])).values()].slice(0, 6);
    diag.verses = unique.map((r) => `${r.surah}:${r.ayah}${r.through ? `-${r.through}` : ""}`);
    return { plan, usePlan, entries, unique };
  });

  const core = refsP.then(async ({ plan, usePlan, entries, unique }) => {
    const basicHadith = entries.flatMap((e) => e.hadithQueries.slice(0, usePlan ? 1 : 2));
    const hadithQs = [...new Set([...(usePlan ? plan!.hadithQueries : []), ...basicHadith])].slice(0, usePlan ? 4 : 3);
    const bayyinatQs = usePlan ? plan!.bayyinatQueries : [];
    const bayyinatNs = entries.flatMap((e) => e.bayyinat).slice(0, 3);
    const jobs: Promise<Candidate | Candidate[] | null>[] = [
      ...unique.map((r) =>
        track(log, `آية ${r.surah}:${r.ayah}${r.through ? `-${r.through}` : ""}`, () => verseCandidate(r, c.lang, deps), left()),
      ),
      // تعريف السورة وفهرس المصحف من data/quran-index.json (بلا شبكة).
      ...(plan?.surahInfo ?? []).map((n) => track(log, `سورة ${n}`, async () => surahInfoCandidate(n), left())),
      ...(plan?.quranIndex ? [track(log, INDEX_SOURCE, async () => quranIndexCandidate(), left())] : []),
      ...hadithQs.map((q) => track(log, `حديث «${q}»`, () => hadithCandidates(q, c.lang, deps), left())),
      ...bayyinatQs.map((q) => track(log, `بيّنات «${q}»`, () => deps.bayyinatSearch(q), left())),
      ...(bayyinatNs.length ? [track(log, `بيّنات ${bayyinatNs.join("، ")}`, () => deps.bayyinatNumbers(bayyinatNs), left())] : []),
    ];
    return mergePinned((await Promise.all(jobs)).flat().filter((x): x is Candidate => x !== null));
  });

  const quran = refsP.then(async ({ plan, unique }) => {
    const known = (r: VerseRef) => unique.some((u) => u.surah === r.surah && u.ayah === r.ayah);
    const fetchRefs = async (refs: VerseRef[]) =>
      (await Promise.all(refs.filter((r) => !known(r)).map((r) => verseCandidate(r, c.lang, deps)))).filter((x): x is Candidate => x !== null);
    const jobs: Promise<Candidate[] | null>[] = [
      // الآية المنقولة بنصها في السؤال (ولو بخطأ): موضعها بالبحث في القرآن.
      ...(quotedVerses(question).length
        ? [track(log, "آية منقولة في السؤال", async () => fetchRefs(await locateQuotedVerses(c, question, deps)), left())]
        : []),
      ...(plan?.quranQueries ?? []).map((q) => track(log, `قرآن «${q}»`, async () => fetchRefs(await quranQueryRefs(q, deps)), left())),
    ];
    return mergePinned((await Promise.all(jobs)).flat().filter((x): x is Candidate => x !== null));
  });

  return { core, quran };
}

// ---------------------------------------------------------------------------
// إعادة الترتيب بالصلة
// ---------------------------------------------------------------------------

const RerankSchema = z.object({
  scores: z.array(z.object({ id: z.string(), score: z.number().min(0).max(RELEVANCE_MAX) })),
});

const RERANK_SYSTEM = `You rate retrieved passages for an Islamic Q&A tool. You do NOT answer the question.
Each passage has an id like S1, S2… Give each passage a relevance score from 0 to 100:
90-100 = directly answers the question or its core concept;
60-89 = clearly relevant content that helps explain the answer;
30-59 = same topic or shares words, but does not help answer THIS question;
0-29 = unrelated.
A book or article description without actual content is at most 30. A published fatwa («فتوى منشورة») about a different question or case is at most 50. A hadith whose meaning is unrelated to the question is at most 30, even if it shares a word. A passage in another language is judged by its meaning.
Return JSON {"scores":[{"id":"S1","score":<0-100>}, …]} with one entry per passage, using the exact ids given.`;

const RERANK_CASE = `CASE MODE: the asker describes their own situation. Each passage is a published fatwa. Score it by how close its published QUESTION is to the asker's matter (the same act, the same chapter of fiqh, similar circumstances): 90-100 = the same matter; 60-89 = a closely similar matter; below 60 = a different matter, or it only shares words. Do not judge whether the ruling applies to the asker.`;

export type RerankMode = "general" | "case";

export async function rerank(
  question: string,
  cands: Candidate[],
  terms: string[],
  mode: RerankMode = "general",
): Promise<{ cands: Candidate[]; mode: "llm" | "keywords" }> {
  const toRate = cands.filter((c) => c.score === undefined);
  if (!toRate.length) return { cands, mode: "llm" };
  try {
    const res = await chatJson(
      [
        { role: "system", content: mode === "case" ? `${RERANK_SYSTEM}\n\n${RERANK_CASE}` : RERANK_SYSTEM },
        { role: "user", content: `QUESTION: """${question}"""\n\nPASSAGES:\n${rerankList(toRate, terms)}` },
      ],
      RerankSchema,
      { temperature: 0, schemaName: "relevance", maxTokens: 1000, timeoutMs: 15_000, retries: 1, retryDelayMs: 0, reasoning: reasoningFor("rerank") },
    );
    applyScores(toRate, res.data.scores);
    for (const c of toRate) c.scoredBy = "llm";
    return { cands, mode: "llm" };
  } catch {
    // احتياط بلا نموذج: تداخل كلمات النص الفعلي مع السؤال (لا kw المصطنع للمراجع المحددة ومصادر
    // «ابحث واقرأ»، فقد كان 50 فيُقبل كل شيء بلا تقييم). والفتوى و«رابط فقط» لا يُقبلان بلا نموذج أبداً.
    for (const c of toRate) {
      c.score = c.fatwa || c.linkOnly ? 0 : keywordScore(overlap(c, terms));
      c.scoredBy = "keywords";
    }
    return { cands, mode: "keywords" };
  }
}

// ---------------------------------------------------------------------------
// المصادر حسب نوع السؤال (Quranpedia والدرر)
// ---------------------------------------------------------------------------

/** سؤال تحقق من حديث: «هل هذا حديث صحيح؟»، «ما درجة حديث…»، "is this hadith authentic". */
const HADITH_CHECK =
  /(صح(?:ة|يح)|درج(?:ة|ته)|ضعيف|موضوع|ثابت|حكم)\s+(?:هذا\s+)?(?:ال)?حديث|(?:ال)?حديث\s+(?:هذا\s+)?(?:صحيح|ضعيف|موضوع|ثابت)|هل\s+(?:هذا\s+|هذه\s+)?(?:ال)?(?:حديث|رواية)|هل\s+(?:صح|ثبت|ورد)\s+(?:عن|أن|ان)|\b(?:authentic|sahih|da'?if|weak|fabricated|graded?)\b[^.?!]{0,40}\bhadith\b|\bhadith\b[^.?!]{0,40}\b(?:authentic|sahih|weak|fabricated|grade)\b/iu;

export function looksHadithCheck(question: string): boolean {
  return HADITH_CHECK.test(question);
}

/** النص المنقول في السؤال بين «» أو "" أو “” (3 كلمات فأكثر): متن الحديث المسؤول عنه مثلاً. */
export function quotedSegment(question: string): string | null {
  const m = question.match(/[«"“]([^«»"“”]{8,300})[»"”]/u);
  const t = m?.[1]?.trim();
  return t && t.split(/\s+/).length >= 3 ? t.split(/\s+/).slice(0, 12).join(" ") : null;
}

/** عبارات البحث العربية (2–4 من المصنّف)، وإلا كلمات السؤال. */
export function arabicPhrases(c: Classification, question: string): string[] {
  const out = [...new Set(c.searchQueries.ar.map((q) => q.trim()).filter(Boolean))].slice(0, 4);
  if (!out.length && /[\u0600-\u06FF]/.test(question)) {
    const kw = queryWords(question).slice(0, 4).join(" ");
    if (kw) out.push(kw);
  }
  return out;
}

/** سؤال تفسير لآية بعينها («ما تفسير الآية 2:255»، «معنى آية الكرسي 2:255»). */
const TAFSIR_ASK = /تفسير|يفسر|فسّر|فسر|معنى|معني|tafsir|tafseer|interpret|meaning|explain/iu;

export type ExtraSearch = { source: SourceId; q: string; lang: string };

/**
 * المصادر المناسبة لنوع السؤال عبر HTTP من الخادم: الفتاوى المنشورة (Quranpedia) بأول 3 عبارات عربية،
 * لكل سؤال A/B/C. (وطبقة «ابحث واقرأ» ومجموعات MCP الإضافية تعمل بالتوازي في retrieve.)
 */
export function extraSearches(c: Classification, question: string): ExtraSearch[] {
  const ar = arabicPhrases(c, question);
  const out: ExtraSearch[] = [];
  const add = (source: SourceId, q: string | null | undefined) => {
    const t = q?.trim().slice(0, 150);
    if (t && !out.some((x) => x.source === source && x.q === t)) out.push({ source, q: t, lang: "ar" });
  };
  ar.slice(0, 3).forEach((q) => add("quranpedia", q));
  // الدرر لا يُطلب من الخادم (يحجبه بـ 403): التحقق من الحديث من متصفح السائل (DorarCard)،
  // ومن صفحة الفحص للتوثيق فقط.
  return out;
}

/** تشغيل مصادر HTTP بالتوازي، لكلٍّ مهلته (8 ث أو ما بقي)، وتسجيل كل بحث في التشخيص. */
async function runExtra(jobs: ExtraSearch[], deps: PinDeps, diag: SearchDiag[], left: () => number): Promise<Candidate[]> {
  const run = deps.sourceSearch ?? DEFAULT_PIN_DEPS.sourceSearch!;
  const results = await Promise.all(
    jobs.map(async ({ source, q, lang }) => {
      const t0 = Date.now();
      const errors: string[] = [];
      const ms = Math.min(EXTRA_DEADLINE_MS, left());
      const found = await run(source, q, lang, ms, (e) => errors.push(e)).catch((e) => {
        errors.push(String((e as Error)?.message ?? e));
        return [] as SourceResult[];
      });
      const took = Date.now() - t0;
      const timedOut = !found.length && !errors.length && took >= ms - 50;
      diag.push({
        query: q,
        lang,
        source,
        results: found.length,
        ms: took,
        ...(errors.length || timedOut ? { error: (errors.join(" | ") || `timeout ${ms}ms`).slice(0, 300) } : {}),
      });
      return found.map(fromSource);
    }),
  );
  return results.flat();
}

/**
 * التفسير لسؤال تفسير يذكر آية بعينها، من خادم MCP (get_quran_verses): للعربية الآية المحددة نفسها
 * تأتي بالتفسير الميسر (أو المختصر)، ولغير العربية تأتي بالترجمة المعتمدة، فيُضاف معها التفسير
 * العربي. (تفسير Quranpedia موقوف: خيارات الآية تعود فارغة في الفحص الحي؛ يبقى في صفحة الفحص.)
 */
async function tafsirCandidates(c: Classification, question: string, deps: PinDeps, diag: SearchDiag[], left: () => number): Promise<Candidate[]> {
  if (c.lang === "ar" || !TAFSIR_ASK.test(question)) return [];
  const ref = explicitVerseRef(question) ?? verseRefsInText(question)[0];
  if (!ref || !isValidVerse(ref.surah, ref.ayah)) return [];
  const t0 = Date.now();
  let error: string | undefined;
  const found = await withTimeout(
    verseCandidate(ref, "ar", deps).catch((e) => {
      error = String((e as Error)?.message ?? e);
      return null;
    }),
    Math.min(15_000, left()),
    null,
  );
  diag.push({ query: `${ref.surah}:${ref.ayah}`, lang: "ar", source: "mcp-tafsir", results: found ? 1 : 0, ms: Date.now() - t0, ...(error ? { error } : {}) });
  return found ? [found] : [];
}

// ---------------------------------------------------------------------------
// مكتبة IslamHouse عبر MCP (search، sources=["library"]): فتاوى ومقالات معتمدة
// ---------------------------------------------------------------------------

/** سؤال فقه (باب من الأبواب أو C) أو مسلم جديد: يُبحث معه في مكتبة IslamHouse. */
export function wantsLibrary(c: Classification): boolean {
  return Boolean((c.chapter && c.chapter !== "other") || c.level === "C" || c.userType === "new_muslim");
}

const IH_FATWA = /islamhouse\.com\/[a-z]{2,3}\/fatwa\//i;

/** نتيجة مكتبة مرشحاً؛ وما كان رابطه فتوى IslamHouse يحمل بيانات الفتوى (بطاقة «فتوى منشورة»). */
function libraryCandidate(it: McpItem, lang: string): Candidate {
  const name = SOURCE_BY_ID.islamhouse.name;
  return {
    title: it.title,
    text: it.text,
    url: it.url,
    source: name,
    sourceId: "islamhouse",
    lang: it.lang ?? lang,
    ...(it.ref ? { ref: it.ref } : {}),
    ...(IH_FATWA.test(it.url) ? { fatwa: { mufti: name, question: it.title, answer: it.text, host: "islamhouse.com" } } : {}),
  };
}

/** البحث في المكتبة بأول عبارتين عربيتين (وبلغة المسلم الجديد إن لم يكن عربياً)، بمهلة 14 ثانية. */
async function libraryCandidates(
  c: Classification,
  question: string,
  deps: PinDeps,
  diag: SearchDiag[],
  left: () => number,
  onlyFatwas = false,
): Promise<Candidate[]> {
  const qs = arabicPhrases(c, question)
    .slice(0, 2)
    .map((q) => ({ q, lang: "ar" }));
  if (c.userType === "new_muslim" && c.lang !== "ar" && c.searchQueries.userLang[0]) qs.push({ q: c.searchQueries.userLang[0], lang: c.lang });
  const lists = await Promise.all(
    qs.map(async ({ q, lang }) => {
      const t0 = Date.now();
      let error: string | undefined;
      const items = await withTimeout(
        deps.searchCorpus(q, lang, "library").catch((e) => {
          error = String((e as Error)?.message ?? e).slice(0, 200);
          return [] as McpItem[];
        }),
        Math.min(14_000, left()),
        [] as McpItem[],
      );
      diag.push({ query: q, lang, source: "mcp-library", results: items.length, ms: Date.now() - t0, ...(error ? { error } : {}) });
      return items.slice(0, 5).map((it) => libraryCandidate(it, lang));
    }),
  );
  const all = lists.flat();
  return onlyFatwas ? all.filter((x) => x.fatwa) : all;
}

// ---------------------------------------------------------------------------
// «الإسلام سؤال وجواب» محلياً (R1d): جدول islamqa_fatwas في Supabase، سريع وبكل اللغات
// ---------------------------------------------------------------------------

/**
 * «الإسلام سؤال وجواب» لكل الأبواب (R1e): الفقه والعقيدة والسيرة وأسماء الله والمسلم الجديد وغير
 * المسلم، فالموقع يغطيها كلها، والبحث محلي سريع، وما لا صلة له يسقط في تقييم الصلة.
 */
export function wantsIslamqa(c: Classification): boolean {
  return !c.outOfScope;
}

/** عبارات البحث: أول عبارتين عربيتين (لكل اللغات) والسؤال نفسه بالعربية، وبالإنجليزية للسائل بها. */
export function islamqaQueries(c: Classification, question: string): IslamqaQuery[] {
  const out: IslamqaQuery[] = [];
  const add = (q: string | undefined, lang: "ar" | "en") => {
    const t = q?.trim().slice(0, 300);
    if (t && !out.some((x) => x.q === t && x.lang === lang)) out.push({ q: t, lang });
  };
  if (c.lang === "ar" && /[\u0600-\u06FF]/.test(question)) add(question, "ar");
  arabicPhrases(c, question).slice(0, 2).forEach((q) => add(q, "ar"));
  if (c.lang === "en") {
    add(question, "en");
    add(c.searchQueries.userLang[0], "en");
  }
  return out.slice(0, 4);
}

/** مهلة البحث المحلي (Postgres): قصيرة، فهو من المصادر السريعة. */
const ISLAMQA_MS = 6_000;

async function islamqaCandidates(
  c: Classification,
  question: string,
  terms: string[],
  deps: PinDeps,
  diag: SearchDiag[],
  left: () => number,
): Promise<Candidate[]> {
  const fn = deps.islamqa ?? DEFAULT_PIN_DEPS.islamqa!;
  const queries = islamqaQueries(c, question);
  if (!queries.length) return [];
  const t0 = Date.now();
  const errors: string[] = [];
  const found = await withTimeout(
    fn(queries, c.lang, terms, (e) => errors.push(e)).catch((e) => {
      errors.push(String((e as Error)?.message ?? e).slice(0, 200));
      return [] as SourceResult[];
    }),
    Math.min(ISLAMQA_MS, left()),
    [] as SourceResult[],
  );
  diag.push({
    query: queries.map((q) => q.q).join(" | ").slice(0, 120),
    lang: c.lang,
    source: "islamqa-local",
    results: found.length,
    ms: Date.now() - t0,
    ...(errors.length ? { error: [...new Set(errors)].join(" | ").slice(0, 300) } : {}),
  });
  return found.map(fromSource);
}

// ---------------------------------------------------------------------------
// الواجهة
// ---------------------------------------------------------------------------

/** النص المرسل للصياغة: النص الطويل بمطلعه ونافذة حول أقوى موضع لكلمات السؤال. */
export function toPassage(c: Candidate, terms: string[] = []): Passage {
  return {
    title: c.title,
    text: focusExcerpt(c.text, terms, PASSAGE_CHARS),
    url: c.url,
    source: c.source,
    grade: c.grade,
    lang: c.lang,
    ...(c.verse ? { verse: c.verse, note: c.note, noteKind: c.noteKind } : {}),
  };
}

/** وصف مواضع الخطة لإعادة التخطيط («quran 96:12»، «hadith query "…"»). */
function planRefs(p: CitationPlan): string[] {
  return [
    ...p.quran.map((v) => `quran ${v.surah}:${v.ayah}${v.through ? `-${v.through}` : ""}`),
    ...p.quranQueries.map((q) => `quran query "${q}"`),
    ...p.hadithQueries.map((q) => `hadith query "${q}"`),
    ...p.bayyinatQueries.map((q) => `bayyinat query "${q}"`),
  ];
}

/** وعد مع علامة اكتماله (لأخذ ما انتهى دون انتظار ما لم ينتهِ). */
function settle<T>(p: Promise<T>, fallback: T): { promise: Promise<T>; done: () => boolean; value: () => T } {
  let done = false;
  let value = fallback;
  const promise = p
    .catch(() => fallback)
    .then((v) => {
      done = true;
      value = v;
      return v;
    });
  return { promise, done: () => done, value: () => value };
}

// ---------------------------------------------------------------------------
// طبقة «ابحث واقرأ»
// ---------------------------------------------------------------------------

/** حد زمن الطبقة (R1e: 35 ثانية)، أو ما بقي من الميزانية ناقص 8 ثوانٍ (لتقييم الصلة بعدها). */
export const WEB_DEADLINE_MS = 35_000;
/** المصادر السريعة تُنتظر حتى هذا الحد قبل التقييم الأول (R1d). */
export const FAST_WAIT_MS = 8_000;
/** مصدران ذوا صلة (≥ 60) في التقييم الأول يكفيان: لا تُنتظر «ابحث واقرأ». */
export const EARLY_EXIT_MIN = 2;
/** يُترك من الميزانية بعد الانتظار الثاني لتقييم الصلة. */
const RERANK_RESERVE_MS = 5_000;

/** علامة مقتطف البحث (نص حرفي من الصفحة دون قراءتها كاملة). */
export const SNIPPET_LABEL = "مقتطف من الصفحة";

/** رابط من المرجعية بلا اقتباس موثَّق (يُعرض رابطاً فقط). */
export type WebLink = { title: string; url: string; site: string };

/**
 * مصادر الطبقة مرشحين: الموثَّق نصه الاقتباس بحروف الصفحة، و«رابط فقط» نصه عنوانه ولا يُرسل للصياغة.
 * ما كان من مواقع الفتاوى يحمل بيانات الفتوى (بطاقة «فتوى منشورة»، والمقتطف هو الاقتباس الموثَّق).
 */
export function webCandidates(sources: WebSource[]): Candidate[] {
  return sources.map((s) => {
    const quote = s.status === "verified" && s.quote ? s.quote : "";
    return {
      title: s.title,
      text: quote || s.title,
      url: s.url,
      // مقتطف البحث (لم تُقرأ الصفحة كاملة) يُعلَّم بذلك أينما عُرض.
      source: quote && s.snippet ? `${s.site} — ${SNIPPET_LABEL}` : s.site,
      sourceId: "web" as const,
      lang: /[\u0600-\u06FF]/.test(quote || s.title) ? "ar" : undefined,
      kw: 50,
      ...(isFatwaDomain(s.domain) ? { fatwa: { mufti: s.site, question: s.title, answer: quote, host: s.domain } } : {}),
      ...(quote ? {} : { linkOnly: true }),
    };
  });
}

/** تشغيل الطبقة بمهلتها، دون رمي أبداً. onSlow: إشارة «أقرأ…» بعد 6 ثوانٍ. */
async function runWeb(
  deps: PinDeps,
  question: string,
  mode: WebMode,
  lang: string,
  phrases: string[],
  timeoutMs: number,
  searches: SearchDiag[],
  onSlow?: () => void,
  /** طبقة بدأت مبكراً (مع التصنيف): تُنتظر بدل طلب جديد. */
  early?: Promise<WebResult>,
): Promise<{ cands: Candidate[]; diag: WebDiag | null }> {
  const fn = deps.web ?? DEFAULT_PIN_DEPS.web!;
  const slow = onSlow ? setTimeout(onSlow, 6_000) : undefined;
  const t0 = Date.now();
  try {
    const result = await withTimeout(
      (early ?? fn(question, { mode, lang, phrases, timeoutMs })).catch(() => null),
      timeoutMs + 1_500,
      null as WebResult | null,
    );
    const ms = Date.now() - t0;
    if (!result) {
      searches.push({ query: phrases.join(" | ").slice(0, 120), lang, source: "web", results: 0, ms, error: `timeout ${timeoutMs}ms` });
      return { cands: [], diag: { queries: [], read: 0, verified: 0, linkOnly: 0, dropped: 0, ms, costUsd: null, error: "timeout" } };
    }
    const verified = result.sources.filter((x) => x.status === "verified").length;
    const diag: WebDiag = {
      queries: result.queries,
      read: result.fetched.length,
      verified,
      linkOnly: result.sources.length - verified,
      dropped: result.dropped.length,
      ms: result.ms,
      costUsd: result.costUsd,
      ...(result.searchOnly ? { searchOnly: true } : {}),
      ...(result.jsonRecovery ? { jsonRecovery: result.jsonRecovery } : {}),
      extracted: result.sources.filter((x) => x.match === "extracted").length,
      snippets: result.sources.filter((x) => x.snippet).length,
      ...(result.error ? { error: result.error } : {}),
    };
    searches.push({
      query: (result.queries.join(" | ") || phrases.join(" | ")).slice(0, 120),
      lang,
      source: "web",
      results: result.sources.length,
      ms: result.ms,
      ...(result.error ? { error: result.error } : {}),
    });
    return { cands: webCandidates(result.sources), diag };
  } finally {
    clearTimeout(slow);
  }
}

/** مجموعات MCP الإضافية بمهلة 12 ثانية (تسقط إن تأخرت). */
async function runMcpExtra(deps: PinDeps, q: string | undefined, lang: string, searches: SearchDiag[], left: () => number): Promise<Candidate[]> {
  if (!q) return [];
  const fn = deps.mcpExtra ?? DEFAULT_PIN_DEPS.mcpExtra!;
  const t0 = Date.now();
  let error: string | undefined;
  const found = await withTimeout(
    fn(q, lang).catch((e) => {
      error = String((e as Error)?.message ?? e).slice(0, 200);
      return [] as SourceResult[];
    }),
    Math.min(12_000, left()),
    [] as SourceResult[],
  );
  if (found.length || error) searches.push({ query: q, lang, source: "mcp-extra", results: found.length, ms: Date.now() - t0, ...(error ? { error } : {}) });
  return found.map(fromSource);
}

export type RetrieveOptions = {
  /** للاختبار المحلي فقط: مصادر المراجع المحددة. */
  deps?: PinDeps;
  /** إعادة التخطيط مرة واحدة بالمواضع التي فشلت (planCitations(question, failed)). */
  replan?: (failed: string[]) => Promise<CitationPlan | null>;
  /** آخر لحظة للاسترجاع (ميزانية السؤال 40 ث ناقص زمن الصياغة). */
  deadline?: number;
  /** «أتحقق من الأدلة…»: بداية تقييم الصلة. */
  onVerify?: () => void;
  /** «أقرأ المصادر…»: طبقة «ابحث واقرأ» ما زالت تقرأ بعد 6 ثوانٍ. */
  onReading?: () => void;
  /** طبقة «ابحث واقرأ» بدأت مع التصنيف (respond.ts) لكسب الوقت. */
  web?: Promise<WebResult>;
  /** وضع المحادثة (R3: lib/brain/modes.ts): ترتيب المصادر وأولويتها فقط، والقبول كما هو. */
  mode?: ChatMode;
};

export type RetrieveResult = {
  passages: Passage[];
  diag: RetrievalDiag;
  /** فتاوى منشورة بلغت 60 فأكثر (حتى 3)، تُعرض بطاقاتٍ تحت الجواب. */
  fatwas: FatwaCard[];
  /** نصوص قريبة لم تبلغ 60 (40–59، حتى 3): تُعرض عند الامتناع بدل الرد الجاف. */
  related: Passage[];
  /** روابط ذات صلة (≥ 60) من «ابحث واقرأ» بلا اقتباس موثَّق: تُعرض روابط فقط. */
  links: WebLink[];
};

/** نتيجة مصدر لم تُستهلك بعد (تُؤخذ عند اكتمالها، مرة واحدة). */
type Job = { kind: "pinned" | "raw"; key: string; s: ReturnType<typeof settle<Candidate[]>>; taken: boolean };

/** يأخذ ما اكتمل ولم يُؤخذ من المصادر، مرة واحدة لكل مصدر. */
function takeDone(jobs: Job[]): Record<string, Candidate[]> {
  const out: Record<string, Candidate[]> = {};
  for (const j of jobs) {
    if (j.taken || !j.s.done()) continue;
    j.taken = true;
    out[j.key] = j.s.value();
  }
  return out;
}

/** انتظار كل الوعود بحد زمني (بلا رمي). */
function waitAll(ps: Promise<unknown>[], ms: number): Promise<void> {
  return withTimeout(Promise.all(ps).then(() => undefined), Math.max(0, ms), undefined);
}

/**
 * الاسترجاع (R1d: السريع أولاً):
 *  1) كل المصادر تبدأ معاً بالتوازي، و«ابحث واقرأ» بدأت قبلها مع التصنيف (respond.ts).
 *  2) المصادر السريعة (islamqa المحلية، و«بيّنات»، و«الأساسيات» والمراجع المحددة، وMCP) تُنتظر حتى
 *     ~8 ثوانٍ، ثم تقييم الصلة لما وصل في طلب واحد مجمّع (ومعه «ابحث واقرأ» إن انتهت).
 *  3) إن بلغ مصدران 60 فأكثر: لا تُنتظر «ابحث واقرأ» ولا ما تأخر (يكمل في الخلفية).
 *     وإلا: انتظار «ابحث واقرأ» (حدها 20 ثانية) وما تأخر، ثم تقييم ما جاء به في طلب واحد.
 *  4) إعادة التخطيط مرة واحدة إن لم يبلغ أي مرجع محدد 60 وبقي وقت.
 * زمن كل مرحلة في diag.stages (جدول «شغّل الكل»).
 */
export async function retrieve(
  c: Classification,
  question: string,
  plan?: Promise<CitationPlan | null>,
  opts: RetrieveOptions = {},
): Promise<RetrieveResult> {
  const started = Date.now();
  const deadline = opts.deadline ?? Date.now() + RETRIEVAL_BUDGET_MS;
  const left = () => Math.max(500, deadline - Date.now());
  const deps = opts.deps ?? DEFAULT_PIN_DEPS;
  const mode = opts.mode ?? "general";
  const queries = buildQueries(c, question);
  const extra = extraSearches(c, question);
  const diag: RetrievalDiag = {
    queries: [...queries, ...extra.filter((x) => !queries.some((q) => q.q === x.q)).map(({ q, lang }) => ({ q, lang }))],
    searches: [],
    retried: false,
    counts: { raw: 0, cleaned: 0, ranked: 0, kept: 0 },
    dropped: [],
    scored: [],
    rerank: "llm",
  };
  const terms = [...new Set([...keywords(question), ...queries.flatMap((q) => keywords(q.q)), ...extra.flatMap((q) => keywords(q.q))])];
  const glossary = glossaryCandidates(question);

  // «بيّنات»: السؤال كما كتبه السائل إن كان عربياً، وإلا كلمات البحث العربية.
  const bayyinatQuery = /[\u0600-\u06FF]/.test(question) && c.lang === "ar" ? question : c.searchQueries.ar.join(" ");
  const pins = pinnedJobs(c, question, diag, plan, deps, deadline, mode);
  const others = RETRIEVAL_SOURCES.filter((x) => x !== "quranenc");
  const phrases = [...arabicPhrases(c, question), ...c.searchQueries.userLang].slice(0, 5);
  const webMs = Math.min(WEB_DEADLINE_MS, Math.max(2_000, deadline - Date.now() - 8_000));
  const none = [] as Candidate[];
  const job = (kind: Job["kind"], key: string, p: Promise<Candidate[]>): Job => ({ kind, key, s: settle(p, none), taken: false });
  const jobs: Job[] = [
    job("pinned", "core", withTimeout(pins.core, left(), none)),
    job("pinned", "quranPins", pins.quran),
    job("pinned", "tafsir", tafsirCandidates(c, question, deps, diag.searches, left).then((xs) => xs.map((x) => ({ ...x, kw: 50, pinned: true })))),
    job("raw", "islamqa", wantsIslamqa(c) ? islamqaCandidates(c, question, terms, deps, diag.searches, left) : Promise.resolve(none)),
    job("raw", "bayyinat", searchBayyinat(bayyinatQuery, diag.searches).catch(() => none)),
    job("raw", "found", searchSources(queries, diag.searches, others, left())),
    job("raw", "quranSearch", searchSources(queries, diag.searches, ["quranenc"], left())),
    job("raw", "published", runExtra(extra, deps, diag.searches, left)),
    job("raw", "mcpExtra", runMcpExtra(deps, arabicPhrases(c, question)[0], c.lang, diag.searches, left)),
    job("raw", "library", wantsLibrary(c) || modeWantsLibrary(mode) ? libraryCandidates(c, question, deps, diag.searches, left) : Promise.resolve(none)),
  ];
  const web = settle(
    runWeb(deps, question, "general", c.lang, phrases, webMs, diag.searches, opts.onReading, opts.web),
    { cands: [], diag: null } as { cands: Candidate[]; diag: WebDiag | null },
  );
  let webTaken = false;

  // «بيّنات» أولاً لأسئلة الشبهات وغير المسلمين (مصدر أساسي للحلول الحوارية في الشبهات).
  const shubha = c.userType === "non_muslim" || Boolean(c.misconception) || c.level === "B" || mode === "discover";
  const seenUrls = new Set<string>();
  const seenKeys = new Set<string>();
  const mark = (x: Candidate) => {
    seenUrls.add(x.url);
    seenKeys.add(urlKey(x.url));
  };
  const poolOf = async (raw: Candidate[], size: number) => {
    const fresh = raw.filter((x) => !seenUrls.has(x.url) && !seenKeys.has(urlKey(x.url)));
    diag.counts.raw += fresh.length;
    const cleaned = clean(fresh, diag.dropped);
    diag.counts.cleaned += cleaned.length;
    const pool = prerank(cleaned, terms, size)
      .map((x) => (x.sourceId === "bayyinat" && shubha && mode === "general" ? { ...x, kw: x.kw! + 2 } : x))
      .map((x) => (sourceBoost(mode, x.sourceId) ? { ...x, kw: x.kw! + sourceBoost(mode, x.sourceId) } : x));
    diag.counts.ranked += pool.length;
    pool.forEach(mark);
    return enrich(pool, c.lang);
  };
  const newPinned = (xs: Candidate[]) => {
    const out = xs.filter((x) => !seenUrls.has(x.url));
    out.forEach(mark);
    return out;
  };
  const hit = (xs: Candidate[]) => xs.some((x) => x.pinned && (x.score ?? 0) >= MIN_SCORE);
  const relevant = (xs: Candidate[]) => xs.filter((x) => !x.linkOnly && (x.score ?? 0) >= MIN_SCORE).length;

  /** دفعة من كل ما اكتمل ولم يُقيَّم: المراجع المحددة، ثم «ابحث واقرأ»، ثم الباقي بترتيب أولي. */
  const batch = async (rawSize: number): Promise<Candidate[]> => {
    const got = takeDone(jobs);
    const webNow = !webTaken && web.done() ? web.value() : null;
    if (webNow) {
      webTaken = true;
      if (webNow.diag) diag.web = webNow.diag;
    }
    // الفتوى نفسها من Quranpedia ومن «ابحث واقرأ»: يُقدَّم نص الطبقة الموثَّق (أدق موضعاً).
    const webKeys = new Set((webNow?.cands ?? []).filter((x) => !x.linkOnly).map((x) => urlKey(x.url)));
    const pinned = newPinned(jobs.filter((j) => j.kind === "pinned" && got[j.key]).flatMap((j) => got[j.key]));
    const webFresh = webNow ? newPinned(webNow.cands.filter((x) => !seenKeys.has(urlKey(x.url)))) : [];
    diag.counts.raw += webFresh.length;
    diag.counts.cleaned += webFresh.length;
    const g = (k: string) => got[k] ?? [];
    // ترتيب المصادر حسب الوضع (modes.ts): التعادل في الترتيب الأولي يُحسم بالأسبق.
    const raw = sourceOrder(mode, shubha).flatMap((k) => (k === "published" ? g(k).filter((x) => !webKeys.has(urlKey(x.url))) : g(k)));
    const pool = raw.length ? await poolOf(raw, rawSize) : [];
    return [...pinned, ...webFresh, ...pool];
  };

  // 1) المصادر السريعة حتى ~8 ثوانٍ (أو حتى تكتمل كلها). بحث القرآن بالكلمات أبطأ: لا يُنتظر هنا،
  //    ويُؤخذ إن كان قد انتهى، وإلا ففي الجولة الثانية.
  const SLOW = new Set(["quranPins", "quranSearch"]);
  await waitAll(
    jobs.filter((j) => !SLOW.has(j.key)).map((j) => j.s.promise),
    Math.min(FAST_WAIT_MS, left()),
  );
  const fastMs = Date.now() - started;
  const webInRound1 = web.done();
  const first = await batch(RERANK_POOL);
  opts.onVerify?.();
  const t1 = Date.now();
  const reranked = await rerank(question, first, terms);
  let all = reranked.cands;
  const stages: RetrievalStages = { fastMs, rerank1Ms: Date.now() - t1, earlyExit: false, webInRound1 };
  diag.stages = stages;

  // 2) مصدران ذوا صلة يكفيان؛ وإلا انتظار «ابحث واقرأ» وما تأخر، وتقييم ما جاء في طلب واحد.
  stages.earlyExit = relevant(all) + glossary.length >= EARLY_EXIT_MIN;
  if (!stages.earlyExit) {
    const t2 = Date.now();
    // مرجع محدد بلغ 60: بحث القرآن بالكلمات لا يُنتظر (يؤخذ إن انتهى).
    const pinHit = hit(all);
    const pending = [
      ...jobs.filter((j) => !j.taken && !(pinHit && SLOW.has(j.key))).map((j) => j.s.promise),
      ...(webTaken ? [] : [web.promise]),
    ];
    if (pending.length) await waitAll(pending, deadline - Date.now() - RERANK_RESERVE_MS);
    stages.waitMs = Date.now() - t2;
    const fresh = await batch(8);
    if (fresh.length) {
      const t3 = Date.now();
      all = [...all, ...(await rerank(question, fresh, terms)).cands];
      stages.rerank2Ms = Date.now() - t3;
    }
  }

  // 3) إعادة التخطيط مرة واحدة: خطة غير فارغة لم يبلغ أي موضع منها 60، وبقي وقت.
  const firstPlan = diag.plan;
  if (!stages.earlyExit && opts.replan && firstPlan && !isEmptyPlan(firstPlan) && !hit(all) && deadline - Date.now() > 6_000) {
    const t4 = Date.now();
    const failed = planRefs(firstPlan);
    const sub: RetrievalDiag = { ...diag, pinLog: [] };
    const second = await withTimeout(
      pinnedCandidates(c, question, sub, opts.replan(failed), deps, deadline),
      left(),
      [] as Candidate[],
    );
    diag.replan = sub.plan;
    diag.pinLog = [...(diag.pinLog ?? []), ...(sub.pinLog ?? []).map((x) => ({ ...x, ref: `↻ ${x.ref}` }))];
    const fresh = newPinned(second);
    if (fresh.length) all = [...all, ...(await rerank(question, fresh, terms)).cands];
    stages.laterMs = Date.now() - t4;
  }

  // «وُجد»: ما بلغ تقييم الصلة فعلاً من المراجع المحددة.
  diag.pinned = all.filter((x) => x.pinned).length;
  diag.counts.raw += glossary.length + diag.pinned;
  diag.counts.cleaned += glossary.length + diag.pinned;
  // القاموس نص المرجعية نفسها: يُقبل دائماً للمصطلح الوارد في السؤال.
  const cands = [...glossary.map((g) => ({ ...g, kw: 0 })), ...all];
  diag.rerank = reranked.mode;
  diag.scored = cands.map((x) => ({ source: x.source, title: clip(x.title, 100), kw: x.kw ?? 0, score: x.score, enriched: Boolean(x.enriched) }));

  // العلاوة للترتيب فقط (مصادر المبتدئين و«بيّنات» في الوضعين الموجّهين)، والقبول بالدرجة نفسها (≥ 60).
  const rankOf = (x: Candidate) => (x.score ?? 0) + rankBonus(mode, x.sourceId);
  const byScore = (a: Candidate, b: Candidate) => rankOf(b) - rankOf(a) || (b.kw ?? 0) - (a.kw ?? 0);
  const ranked = cands.filter((x) => (x.score ?? 0) >= MIN_SCORE).sort(byScore);
  // «رابط فقط» لا يُرسل للصياغة أبداً (لا نص فيه): الفتوى منه بطاقة بلا مقتطف، وغيره رابط.
  // الفتوى لا تُعرض إلا إن قيّمها النموذج ضد السؤال الحالي (≥ 60).
  const fatwaKept = ranked.filter((x) => x.fatwa && x.scoredBy === "llm");
  const fatwaPassages = fatwaKept.filter((x) => !x.linkOnly).slice(0, MAX_FATWA_PASSAGES);
  const kept = [...ranked.filter((x) => !x.fatwa && !x.linkOnly).slice(0, MAX_PASSAGES - fatwaPassages.length), ...fatwaPassages].sort(byScore);
  diag.counts.kept = kept.length;
  const links = ranked
    .filter((x) => x.linkOnly && !x.fatwa)
    .slice(0, 3)
    .map((x) => ({ title: x.title, url: x.url, site: x.source }));
  const related = cands
    .filter((x) => !x.fatwa && !x.linkOnly && (x.score ?? 0) >= RELATED_MIN && (x.score ?? 0) < MIN_SCORE)
    .sort(byScore)
    .slice(0, 3);
  return {
    passages: kept.map((x) => toPassage(x, terms)),
    diag,
    fatwas: fatwaKept.slice(0, MAX_FATWA_CARDS).flatMap((x) => toFatwaCard(x) ?? []),
    related: related.map((x) => toPassage(x, terms)),
    links,
  };
}

// ---------------------------------------------------------------------------
// الحالة الشخصية (D): فتاوى منشورة قريبة للاطلاع فقط، ثم الإحالة
// ---------------------------------------------------------------------------

/** مهلة البحث عن فتاوى منشورة قبل الاستيضاح (لا تؤخر الإحالة طويلاً). */
export const CASE_FATWA_BUDGET_MS = 50_000;

export type CaseFatwas = {
  fatwas: FatwaCard[];
  diag: { searches: SearchDiag[]; scored: { title: string; score?: number }[]; rerank?: "llm" | "keywords"; web?: WebDiag };
};

/**
 * D: قبل الاستيضاح، فتاوى منشورة مشابهة لسؤال السائل (نطاقات المرجعية وحدها): «الإسلام سؤال وجواب»
 * المحلية وQuranpedia وفتاوى IslamHouse أولاً (سريعة)، و«ابحث واقرأ» في مواقع الفتاوى بالتوازي.
 * تُقيَّم بقرب سؤالها المنشور من مسألة السائل، ولا يبقى إلا ما بلغ 60 (حتى 3). إن بلغت فتويان 60 خلال
 * ~8 ثوانٍ لا تُنتظر «ابحث واقرأ». وإن تعذّر النموذج فلا شيء (لا نعرض فتوى على حالة شخصية بتداخل الكلمات).
 */
export async function caseFatwas(
  c: Classification,
  question: string,
  opts: { deps?: PinDeps; deadline?: number; onReading?: () => void; web?: Promise<WebResult> } = {},
): Promise<CaseFatwas> {
  const deadline = opts.deadline ?? Date.now() + CASE_FATWA_BUDGET_MS;
  const left = () => Math.max(500, deadline - Date.now());
  const deps = opts.deps ?? DEFAULT_PIN_DEPS;
  const searches: SearchDiag[] = [];
  const jobs: ExtraSearch[] = arabicPhrases(c, question)
    .slice(0, 3)
    .map((q) => ({ source: "quranpedia" as const, q, lang: "ar" }));
  const terms = [...new Set([...keywords(question), ...jobs.flatMap((j) => keywords(j.q))])];
  const webMs = Math.min(WEB_DEADLINE_MS, Math.max(2_000, deadline - Date.now() - 6_000));
  const none = [] as Candidate[];
  const local: Job[] = [
    { kind: "raw", key: "islamqa", s: settle(islamqaCandidates(c, question, terms, deps, searches, left), none), taken: false },
    { kind: "raw", key: "quranpedia", s: settle(runExtra(jobs, deps, searches, left), none), taken: false },
    // فتاوى IslamHouse المعتمدة المشابهة (مكتبة MCP).
    { kind: "raw", key: "library", s: settle(libraryCandidates(c, question, deps, searches, left, true), none), taken: false },
  ];
  const web = settle(
    runWeb(deps, question, "case", c.lang, jobs.map((j) => j.q), webMs, searches, opts.onReading, opts.web),
    { cands: [], diag: null } as { cands: Candidate[]; diag: WebDiag | null },
  );
  let webTaken = false;
  let webDiag: WebDiag | undefined;
  const seen = new Set<string>();
  let mode: "llm" | "keywords" = "llm";
  const scoredAll: Candidate[] = [];

  /** ما اكتمل ولم يُقيَّم: فتاوى «ابحث واقرأ» بنصها مقدَّمة على الفتوى نفسها من غيرها. */
  const round = async () => {
    const got = takeDone(local);
    const webNow = !webTaken && web.done() ? web.value() : null;
    if (webNow) {
      webTaken = true;
      webDiag = webNow.diag ?? undefined;
    }
    const verifiedWeb = new Set((webNow?.cands ?? []).filter((x) => x.fatwa && !x.linkOnly).map((x) => urlKey(x.url)));
    const cleaned = clean(Object.values(got).flat().filter((x) => x.fatwa && !verifiedWeb.has(urlKey(x.url)) && !seen.has(urlKey(x.url))), []);
    cleaned.forEach((x) => seen.add(urlKey(x.url)));
    const webFatwas = (webNow?.cands ?? []).filter((x) => x.fatwa && !seen.has(urlKey(x.url)));
    webFatwas.forEach((x) => seen.add(urlKey(x.url)));
    const pool = [...webFatwas, ...prerank(cleaned, terms, 8)];
    if (!pool.length) return;
    const res = await rerank(question, pool, terms, "case");
    if (res.mode !== "llm") mode = "keywords";
    scoredAll.push(...res.cands);
  };
  const enough = () => scoredAll.filter((x) => x.scoredBy === "llm" && (x.score ?? 0) >= MIN_SCORE).length >= EARLY_EXIT_MIN;

  await waitAll(
    local.map((j) => j.s.promise),
    Math.min(FAST_WAIT_MS, left()),
  );
  await round();
  if (!enough()) {
    const pending = [...local.filter((j) => !j.taken).map((j) => j.s.promise), ...(webTaken ? [] : [web.promise])];
    if (pending.length) await waitAll(pending, deadline - Date.now() - 4_000);
    await round();
  }

  const scored = scoredAll.map((x) => ({ title: clip(x.title, 100), score: x.score }));
  if (!scoredAll.length) return { fatwas: [], diag: { searches, scored: [], web: webDiag } };
  const fatwas = scoredAll
    .filter((x) => x.scoredBy === "llm" && (x.score ?? 0) >= MIN_SCORE)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, MAX_FATWA_CARDS)
    .flatMap((x) => toFatwaCard(x) ?? []);
  return { fatwas, diag: { searches, scored, rerank: mode, web: webDiag } };
}
