import "server-only";

import { z } from "zod";
import { cached, DAY } from "@/lib/cache";
import { chatJson } from "@/lib/llm";
import { callTool, toolData, toolText } from "@/lib/mcp";
import { search, type SourceId, type SourceResult } from "@/lib/sources";
import { clip, htmlToText } from "@/lib/sources/html";
import { findTool, mcpQuranRange, mcpSearch, mcpSearchAny, type McpItem } from "@/lib/sources/mcp-search";
import { SOURCE_BY_ID } from "@/lib/sources/registry";
import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";
import { matchBasics, parseVerseRef, quotedVerses, verseRefsInText, type VerseRef } from "./basics";
import type { Classification } from "./classify";
import { isEmptyPlan, type CitationPlan } from "./plan";
import { findTerms } from "./glossary";
import { applyScores, clean, cleanToolText, focusExcerpt, keywords, prerank, rerankList, STOP, type Candidate as RankCandidate } from "./rank";
import { explicitVerseRef, INDEX_SOURCE, indexSummaryLine, isValidVerse, parseVerseText, surahInfoLine, surahUrl, verseTitle } from "./quran-index";
import { matchKey } from "./guard";
import type { Passage } from "./prompts";

/**
 * الاسترجاع لمُستفتي: من البحث إلى النصوص التي تُرسل للصياغة.
 *
 *  1) البحث: MCP (الحديث، والقرآن) + «بيّنات» (Supabase) + قاموس المرجعية، بكلمتي بحث على
 *     الأكثر لكل مصدر. IslamHouse رابط فقط (بطيء ويتجاوز المهلة، فلا يدخل المسار الحي).
 *  2) التنظيف: حذف أوصاف الكتب (لا محتوى فيها)، وعناصر واجهة المواقع، والمكرر.
 *  3) ترتيب أولي بتداخل الكلمات (بعد إزالة التشكيل)، مع حصة لكل مصدر حتى لا يطغى مصدر.
 *  4) الإثراء: المحتوى لا العنوان — شرح الحديث ودرجته بأداة get_hadith/fetch.
 *  5) إعادة ترتيب بالصلة بطلب واحد مجمّع للنموذج (0–3)، ولا يُرسل للصياغة إلا ما درجته ≥ 2.
 */

export type Candidate = RankCandidate & {
  sourceId: SourceId | "bayyinat" | "glossary" | "quran-index";
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
  /** أعداد كل مرحلة: الخام، وبعد التنظيف، والمرشحون للتقييم، والمقبولون (≥2). */
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
  /** خطة إعادة التخطيط (مرة واحدة) إن لم يبلغ أي موضع من الأولى درجة 2. */
  replan?: CitationPlan;
  /** عدد المراجع المحددة التي بلغت تقييم الصلة فعلاً، وسجل كل مرجع (وُجد / فارغ / خطأ / مهلة). */
  pinned?: number;
  pinLog?: PinLog[];
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
const RERANK_POOL = 14;
const MAX_PASSAGES = 6;
const MIN_SCORE = 2;
const PASSAGE_CHARS = 1400;
/** مهلة إثراء كل نص بشرحه (مستقلة عن البحث). */
const ENRICH_MS = 12_000;
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
  return { title: r.title, text: r.text, url: r.url, source: r.source, sourceId: r.sourceId, grade: r.grade, lang: r.lang, ref: r.ref };
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
};

export const DEFAULT_PIN_DEPS: PinDeps = {
  quranRange: mcpQuranRange,
  searchCorpus: mcpSearch,
  searchAny: mcpSearchAny,
  detail: mcpDetail,
  bayyinatSearch: (q) => searchBayyinat(q, [], 3),
  bayyinatNumbers: (ns) => bayyinatByNumber(ns),
};

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
 *   يُنتظر إن بلغ مرجع من core درجة 2 (retrieve).
 */
export function pinnedJobs(
  c: Classification,
  question: string,
  diag: RetrievalDiag,
  planPromise: Promise<CitationPlan | null> | undefined,
  deps: PinDeps,
  deadline: number,
): { core: Promise<Candidate[]>; quran: Promise<Candidate[]> } {
  const log: PinLog[] = [];
  diag.pinLog = log;
  const left = () => Math.max(500, deadline - Date.now());
  const planP = (planPromise ?? Promise.resolve(null)).catch(() => null);

  const refsP = planP.then((plan) => {
    const usePlan = !isEmptyPlan(plan);
    const entries = usePlan ? [] : matchBasics(question);
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
    const hadithQs = usePlan ? plan!.hadithQueries : entries.flatMap((e) => e.hadithQueries.slice(0, 2)).slice(0, 3);
    const bayyinatQs = usePlan ? plan!.bayyinatQueries : [];
    const bayyinatNs = usePlan ? [] : entries.flatMap((e) => e.bayyinat).slice(0, 3);
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

async function rerank(question: string, cands: Candidate[], terms: string[]): Promise<{ cands: Candidate[]; mode: "llm" | "keywords" }> {
  const toRate = cands.filter((c) => c.score === undefined);
  if (!toRate.length) return { cands, mode: "llm" };
  try {
    const res = await chatJson(
      [
        { role: "system", content: RERANK_SYSTEM },
        { role: "user", content: `QUESTION: """${question}"""\n\nPASSAGES:\n${rerankList(toRate, terms)}` },
      ],
      RerankSchema,
      { temperature: 0, schemaName: "relevance", maxTokens: 1000, timeoutMs: 20_000, retries: 1 },
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

export type RetrieveOptions = {
  /** للاختبار المحلي فقط: مصادر المراجع المحددة. */
  deps?: PinDeps;
  /** إعادة التخطيط مرة واحدة بالمواضع التي فشلت (planCitations(question, failed)). */
  replan?: (failed: string[]) => Promise<CitationPlan | null>;
  /** آخر لحظة للاسترجاع (ميزانية السؤال 40 ث ناقص زمن الصياغة). */
  deadline?: number;
  /** «أتحقق من الأدلة…»: بداية تقييم الصلة. */
  onVerify?: () => void;
};

/**
 * الاسترجاع على جولتين:
 *  1) المراجع المحددة (core) + بحث الحديث و«بيّنات» ← تقييم الصلة. ويدخل معها ما انتهى من بحث
 *     القرآن بالكلمات.
 *  2) إن لم يبلغ مرجع محدد درجة 2: انتظار بحث القرآن بالكلمات (ضمن الميزانية) وتقييم ما جاء به،
 *     ثم إعادة التخطيط مرة واحدة إن بقي الأمر كذلك.
 * الانتظار أفضل من الامتناع: كل خطوة محدودة بما بقي من الميزانية فقط.
 */
export async function retrieve(
  c: Classification,
  question: string,
  plan?: Promise<CitationPlan | null>,
  opts: RetrieveOptions = {},
): Promise<{ passages: Passage[]; diag: RetrievalDiag }> {
  const deadline = opts.deadline ?? Date.now() + RETRIEVAL_BUDGET_MS;
  const left = () => Math.max(500, deadline - Date.now());
  const deps = opts.deps ?? DEFAULT_PIN_DEPS;
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
  const pins = pinnedJobs(c, question, diag, plan, deps, deadline);
  const quranPins = settle(pins.quran, [] as Candidate[]);
  const quranSearch = settle(searchSources(queries, diag.searches, ["quranenc"], left()), [] as Candidate[]);
  const others = RETRIEVAL_SOURCES.filter((x) => x !== "quranenc");
  const [pinnedCore, found, bayyinat] = await Promise.all([
    withTimeout(pins.core, left(), [] as Candidate[]),
    searchSources(queries, diag.searches, others, left()),
    searchBayyinat(bayyinatQuery, diag.searches).catch(() => [] as Candidate[]),
  ]);

  // «بيّنات» أولاً لأسئلة الشبهات وغير المسلمين (مصدر أساسي للحلول الحوارية في الشبهات).
  const shubha = c.userType === "non_muslim" || Boolean(c.misconception) || c.level === "B";
  const seenUrls = new Set<string>();
  const poolOf = async (raw: Candidate[], size: number) => {
    const fresh = raw.filter((x) => !seenUrls.has(x.url));
    diag.counts.raw += fresh.length;
    const cleaned = clean(fresh, diag.dropped);
    diag.counts.cleaned += cleaned.length;
    const pool = prerank(cleaned, terms, size).map((x) => (x.sourceId === "bayyinat" && shubha ? { ...x, kw: x.kw! + 2 } : x));
    diag.counts.ranked += pool.length;
    pool.forEach((x) => seenUrls.add(x.url));
    return enrich(pool, c.lang);
  };
  const newPinned = (xs: Candidate[]) => {
    const out = xs.filter((x) => !seenUrls.has(x.url));
    out.forEach((x) => seenUrls.add(x.url));
    return out;
  };
  const hit = (xs: Candidate[]) => xs.some((x) => x.pinned && (x.score ?? 0) >= MIN_SCORE);

  // الجولة 1: ما وصل + ما انتهى من بحث القرآن.
  const round1Pinned = newPinned([...pinnedCore, ...(quranPins.done() ? quranPins.value() : [])]);
  const round1Raw = [...(shubha ? bayyinat : []), ...found, ...(quranSearch.done() ? quranSearch.value() : []), ...(shubha ? [] : bayyinat)];
  const enriched = await poolOf(round1Raw, RERANK_POOL);
  opts.onVerify?.();
  const reranked = await rerank(question, [...round1Pinned, ...enriched], terms);
  let all = reranked.cands;

  // الجولة 2: لا مرجع محدد بلغ درجة 2 ← انتظار بحث القرآن بالكلمات وتقييم ما جاء به.
  if (!hit(all) && (!quranPins.done() || !quranSearch.done())) {
    const [qp, qs] = await Promise.all([withTimeout(quranPins.promise, left(), []), withTimeout(quranSearch.promise, left(), [])]);
    const fresh = [...newPinned(qp), ...(await poolOf(qs, 6))];
    if (fresh.length) all = [...all, ...(await rerank(question, fresh, terms)).cands];
  }

  // إعادة التخطيط مرة واحدة: خطة غير فارغة لم يبلغ أي موضع منها درجة 2.
  const firstPlan = diag.plan;
  if (opts.replan && firstPlan && !isEmptyPlan(firstPlan) && !hit(all) && deadline - Date.now() > 3_000) {
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
  }

  // «وُجد»: ما بلغ تقييم الصلة فعلاً من المراجع المحددة.
  diag.pinned = all.filter((x) => x.pinned).length;
  diag.counts.raw += glossary.length + diag.pinned;
  diag.counts.cleaned += glossary.length + diag.pinned;
  // القاموس نص المرجعية نفسها: يُقبل دائماً للمصطلح الوارد في السؤال.
  const cands = [...glossary.map((g) => ({ ...g, kw: 0 })), ...all];
  diag.rerank = reranked.mode;
  diag.scored = cands.map((x) => ({ source: x.source, title: clip(x.title, 100), kw: x.kw ?? 0, score: x.score, enriched: Boolean(x.enriched) }));

  const kept = cands
    .filter((x) => (x.score ?? 0) >= MIN_SCORE)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.kw ?? 0) - (a.kw ?? 0))
    .slice(0, MAX_PASSAGES);
  diag.counts.kept = kept.length;
  return { passages: kept.map((x) => toPassage(x, terms)), diag };
}
