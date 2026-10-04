import "server-only";

import { z } from "zod";
import { cached, DAY } from "@/lib/cache";
import { chatJson } from "@/lib/llm";
import { callTool, toolData, toolText } from "@/lib/mcp";
import { search, SOURCE_DEADLINE_MS, type SourceId, type SourceResult } from "@/lib/sources";
import { clip, htmlToText } from "@/lib/sources/html";
import { findTool } from "@/lib/sources/mcp-search";
import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";
import type { Classification } from "./classify";
import { findTerms } from "./glossary";
import { applyScores, clean, cleanToolText, keywords, prerank, rerankList, STOP, type Candidate as RankCandidate } from "./rank";
import { matchKey } from "./guard";
import type { Passage } from "./prompts";

/**
 * الاسترجاع لمُستفتي: من البحث إلى النصوص التي تُرسل للصياغة.
 *
 *  1) البحث: MCP (IslamHouse، والحديث، والقرآن) + بيان الإسلام + رسالة الحرمين + الإسلام سؤال وجواب
 *     + «بيّنات» (Supabase) + قاموس المرجعية، بكلمات عربية وبلغة السائل.
 *  2) التنظيف: حذف أوصاف الكتب (لا محتوى فيها)، وعناصر واجهة المواقع، والمكرر.
 *  3) ترتيب أولي بتداخل الكلمات (بعد إزالة التشكيل)، مع حصة لكل مصدر حتى لا يطغى مصدر.
 *  4) الإثراء: المحتوى لا العنوان — شرح الحديث ودرجته بأداة get_hadith/fetch، ومقتطف صفحة
 *     بيان الإسلام الفعلي، ونص مادة IslamHouse.
 *  5) إعادة ترتيب بالصلة بطلب واحد مجمّع للنموذج (0–3)، ولا يُرسل للصياغة إلا ما درجته ≥ 2.
 */

export type Candidate = RankCandidate & { sourceId: SourceId | "bayyinat" | "glossary" };

export type SearchDiag = { query: string; lang: string; source: string; results: number; ms: number };

export type RetrievalDiag = {
  queries: { q: string; lang: string }[];
  searches: SearchDiag[];
  retried: boolean;
  /** أعداد كل مرحلة: الخام، وبعد التنظيف، والمرشحون للتقييم، والمقبولون (≥2). */
  counts: { raw: number; cleaned: number; ranked: number; kept: number };
  dropped: { reason: string; source: string; title: string }[];
  /** المرشحون بدرجاتهم (للتشخيص). */
  scored: { source: string; title: string; kw: number; score?: number; enriched: boolean }[];
  rerank: "llm" | "keywords";
};

/**
 * مصادر البحث الآلي: منصات الجمعية عبر MCP. بيان الإسلام ورسالة الحرمين والإسلام سؤال وجواب
 * صارت «رابط فقط» لأن بحثها يعيد النتائج نفسها مهما كان السؤال (registry.ts).
 */
export const RETRIEVAL_SOURCES: SourceId[] = ["islamhouse", "hadeethenc", "quranenc"];
/** مهلة كل مصدر: المهلة الموحدة 6 ثوانٍ (S5، للسرعة). */
const SEARCH_DEADLINE_MS = SOURCE_DEADLINE_MS;
const RETRY_WAIT_MS = 2_500;
const RERANK_POOL = 14;
const MAX_PASSAGES = 6;
const MIN_SCORE = 2;
const PASSAGE_CHARS = 1400;
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
  c.searchQueries.ar.slice(0, 3).forEach((q) => add(q, "ar"));
  if (c.lang !== "ar") c.searchQueries.userLang.slice(0, 2).forEach((q) => add(q, c.lang));
  for (const t of findTerms(question).slice(0, 2)) add(t.term_ar, "ar");
  const kw = queryWords(question).slice(0, 5).join(" ");
  if (kw && out.length < 5) add(kw, c.lang);
  return out.slice(0, 5);
}

// ---------------------------------------------------------------------------
// البحث
// ---------------------------------------------------------------------------

/**
 * تسخين البحث بالتوازي مع المصنّف (S5): كلمات البحث التي لا تحتاج المصنّف (مصطلحات القاموس
 * الواردة وكلمات السؤال نفسه، كما في buildQueries) تُطلب فور وصول السؤال، فتجدها retrieve()
 * جاهزة أو قيد الطلب (lib/cache يضم الطلبات المتزامنة). لا يُعرض منها شيء.
 * المتصل لا يستدعيها لحالة شخصية أو عاجلة.
 */
export function warmSearch(question: string, lang: string): void {
  const queries = findTerms(question)
    .slice(0, 2)
    .map((t) => ({ q: t.term_ar.trim().slice(0, 120), lang: "ar" }));
  const kw = queryWords(question).slice(0, 5).join(" ").trim().slice(0, 120);
  if (kw) queries.push({ q: kw, lang });
  for (const { q, lang: l } of queries) {
    for (const source of RETRIEVAL_SOURCES) void search(source, q, l, SEARCH_DEADLINE_MS).catch(() => []);
  }
}

function fromSource(r: SourceResult): Candidate {
  return { title: r.title, text: r.text, url: r.url, source: r.source, sourceId: r.sourceId, grade: r.grade, lang: r.lang, ref: r.ref };
}

async function searchSources(queries: { q: string; lang: string }[], diag: SearchDiag[]): Promise<Candidate[]> {
  const jobs = queries.flatMap(({ q, lang }) =>
    RETRIEVAL_SOURCES.map(async (source) => {
      const t0 = Date.now();
      const results = await search(source, q, lang, SEARCH_DEADLINE_MS).catch(() => []);
      diag.push({ query: q, lang, source, results: results.length, ms: Date.now() - t0 });
      return results.map(fromSource);
    }),
  );
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
  const rows = (Array.isArray(data) ? data : []) as {
    number: number;
    question: string;
    answer: string;
    page: number | null;
    source_url: string | null;
    score?: number;
  }[];
  diag.push({ query: q.slice(0, 80), lang: "ar", source: "bayyinat", results: rows.length, ms: Date.now() - t0 });
  if (error) console.warn("search_bayyinat:", error.message);
  return rows.map((row) => {
    const label = `بيّنات — السؤال رقم ${row.number}${row.page ? `، ص ${row.page}` : ""}`;
    const question = String(row.question).replace(/﴿\s*﴾/g, "").trim();
    return {
      title: `${label}: ${question}`,
      text: `${question}\n${String(row.answer)}`.replace(/﴿\s*﴾/g, "").replace(/[ \t]+/g, " ").trim(),
      // علامة # برقم السؤال: الرابط نفسه لكل الأجوبة، فلا يحذفها التنظيف مكرراً.
      url: `${row.source_url || BAYYINAT_URL}#${row.number}`,
      source: label,
      sourceId: "bayyinat" as const,
      lang: "ar",
    };
  });
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
    score: 3,
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
        const explanation = deepPick(data, ["explanation", "sharh", "explanation_text", "commentary"]);
        // بلا شرح في البيانات المنظمة: النص الكامل بعد التنظيف (فيه الحديث والشرح والدرجة).
        const body =
          kind === "hadith"
            ? explanation
              ? [deepPick(data, ["hadeeth", "hadith", "text", "arabic_text", "content"]), explanation].filter(Boolean).join("\n")
              : ""
            : [deepPick(data, ["description", "summary", "content", "text", "body"])].filter(Boolean).join("\n");
        const text = clip(htmlToText(body || cleanToolText(raw)), PASSAGE_CHARS);
        const grade = deepPick(data, ["grade", "hadith_grade", "grade_ar", "hukm", "degree", "authenticity"]) ?? raw.match(GRADE_RE)?.[1]?.trim();
        if (text.length > 20) return { text, grade };
      } catch {
        /* الأداة التالية */
      }
    }
    return null;
  });
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p.catch(() => fallback), new Promise<T>((r) => (timer = setTimeout(() => r(fallback), ms)))]).finally(() =>
    clearTimeout(timer),
  );
}

/** يثري أعلى المرشحين بمحتواهم: 4 أحاديث (نص + شرح + درجة)، و3 مواد من IslamHouse. */
async function enrich(cands: Candidate[], lang: string): Promise<Candidate[]> {
  const quota: Partial<Record<Candidate["sourceId"], number>> = { hadeethenc: 4, islamhouse: 3 };
  const used: Partial<Record<Candidate["sourceId"], number>> = {};
  return Promise.all(
    cands.map(async (c) => {
      const n = used[c.sourceId] ?? 0;
      if (n >= (quota[c.sourceId] ?? 0)) return c;
      used[c.sourceId] = n + 1;
      if ((c.sourceId === "hadeethenc" || c.sourceId === "islamhouse") && (c.ref || c.url)) {
        const ref = c.ref ?? c.url.match(/\/(\d{3,})/)?.[1];
        if (!ref) return c;
        const d = await withTimeout(mcpDetail(ref, c.lang ?? lang, c.sourceId === "hadeethenc" ? "hadith" : "library"), 6_000, null);
        return d ? { ...c, text: d.text, grade: c.grade ?? d.grade, enriched: true } : c;
      }
      return c;
    }),
  );
}

// ---------------------------------------------------------------------------
// إعادة الترتيب بالصلة
// ---------------------------------------------------------------------------

const RerankSchema = z.object({
  scores: z.array(z.object({ id: z.string(), score: z.number().int().min(0).max(3) })),
});

const RERANK_SYSTEM = `You rate retrieved passages for an Islamic Q&A tool. You do NOT answer the question.
Each passage has an id like S1, S2… For each passage give a relevance score:
3 = directly answers the question or its core concept;
2 = clearly relevant content that helps explain the answer;
1 = shares a word or the topic but does not help answer;
0 = unrelated.
A book or article description without actual content is at most 1. A passage in another language is judged by its meaning.
Return JSON {"scores":[{"id":"S1","score":<0-3>}, …]} with one entry per passage, using the exact ids given.`;

async function rerank(question: string, cands: Candidate[]): Promise<{ cands: Candidate[]; mode: "llm" | "keywords" }> {
  const toRate = cands.filter((c) => c.score === undefined);
  if (!toRate.length) return { cands, mode: "llm" };
  try {
    const res = await chatJson(
      [
        { role: "system", content: RERANK_SYSTEM },
        { role: "user", content: `QUESTION: """${question}"""\n\nPASSAGES:\n${rerankList(toRate)}` },
      ],
      RerankSchema,
      { temperature: 0, schemaName: "relevance", maxTokens: 700, timeoutMs: 20_000, retries: 1 },
    );
    applyScores(toRate, res.data.scores);
    return { cands, mode: "llm" };
  } catch {
    // احتياط بلا نموذج: تداخل الكلمات.
    for (const c of toRate) c.score = c.kw! >= 4 ? 3 : c.kw! >= 2 ? 2 : c.kw! >= 1 ? 1 : 0;
    return { cands, mode: "keywords" };
  }
}

// ---------------------------------------------------------------------------
// الواجهة
// ---------------------------------------------------------------------------

export function toPassage(c: Candidate): Passage {
  return { title: c.title, text: clip(c.text, PASSAGE_CHARS), url: c.url, source: c.source, grade: c.grade, lang: c.lang };
}

export async function retrieve(
  c: Classification,
  question: string,
): Promise<{ passages: Passage[]; diag: RetrievalDiag }> {
  const queries = buildQueries(c, question);
  const diag: RetrievalDiag = {
    queries,
    searches: [],
    retried: false,
    counts: { raw: 0, cleaned: 0, ranked: 0, kept: 0 },
    dropped: [],
    scored: [],
    rerank: "llm",
  };
  const terms = [...new Set([...keywords(question), ...queries.flatMap((q) => keywords(q.q))])];
  const glossary = glossaryCandidates(question);

  // «بيّنات»: السؤال كما كتبه السائل إن كان عربياً، وإلا كلمات البحث العربية.
  const bayyinatQuery = /[\u0600-\u06FF]/.test(question) && c.lang === "ar" ? question : c.searchQueries.ar.join(" ");
  const run = () =>
    Promise.all([searchSources(queries, diag.searches), searchBayyinat(bayyinatQuery, diag.searches).catch(() => [])]);
  let [found, bayyinat] = await run();
  if (!found.length && !bayyinat.length) {
    diag.retried = true;
    await new Promise((r) => setTimeout(r, RETRY_WAIT_MS));
    [found, bayyinat] = await run();
  }
  // «بيّنات» أولاً لأسئلة الشبهات وغير المسلمين (مصدر أساسي للحلول الحوارية في الشبهات).
  const shubha = c.userType === "non_muslim" || Boolean(c.misconception) || c.level === "B";
  const raw = [...(shubha ? bayyinat : []), ...found, ...(shubha ? [] : bayyinat)];
  diag.counts.raw = raw.length + glossary.length;

  const cleaned = clean(raw, diag.dropped);
  diag.counts.cleaned = cleaned.length + glossary.length;
  const pool = prerank(cleaned, terms, RERANK_POOL).map((x) => (x.sourceId === "bayyinat" && shubha ? { ...x, kw: x.kw! + 2 } : x));
  diag.counts.ranked = pool.length;

  const enriched = await enrich(pool, c.lang);
  const reranked = await rerank(question, enriched);
  const mode = reranked.mode;
  // القاموس نص المرجعية نفسها: يُقبل دائماً للمصطلح الوارد في السؤال.
  const cands = [...glossary.map((g) => ({ ...g, kw: 0 })), ...reranked.cands];
  diag.rerank = mode;
  diag.scored = cands.map((x) => ({ source: x.source, title: clip(x.title, 100), kw: x.kw ?? 0, score: x.score, enriched: Boolean(x.enriched) }));

  const kept = cands
    .filter((x) => (x.score ?? 0) >= MIN_SCORE)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.kw ?? 0) - (a.kw ?? 0))
    .slice(0, MAX_PASSAGES);
  diag.counts.kept = kept.length;
  return { passages: kept.map(toPassage), diag };
}
