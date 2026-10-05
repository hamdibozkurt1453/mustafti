import { z } from "zod";
import { WEB_ALLOWED_DOMAINS, WEB_FATWA_DOMAINS, WEB_SITE_NAMES } from "@/lib/sources/registry";
import { bestParagraphs } from "./excerpt";

/**
 * طبقة «ابحث واقرأ» — الجزء النقي (يُختبر محلياً بردود مسجّلة):
 *  - قراءة جواب النموذج (JSON): عبارات البحث، والمصادر {url, title, site, quote}، والشرح.
 *  - فلتر النطاقات: كل رابط خارج نطاقات المرجعية (WEB_ALLOWED_DOMAINS) يُحذف، ولو أعاده النموذج.
 *  - المحتوى المقروء: ما أعادته أداة web_fetch في الرد الخام (إن توفّر)، من أي موضع فيه.
 *  - النص من الصفحة نفسها يقتطعه الكود (R1d): أفضل فقرة أو فقرتين من المحتوى المقروء لكلمات
 *    السؤال، فهو حرفي بالضرورة. ومقتطفات البحث (snippets/highlights) نص حرفي من الصفحة أيضاً،
 *    فتُستعمل بعلامة «مقتطف من الصفحة». واقتباس النموذج احتياط فقط: يُقبل إن وُجد حرفياً في المحتوى.
 *  - «رابط فقط» لا يبقى إلا إن لم يتوفر أي نص للرابط.
 */

export type WebDomain = (typeof WEB_ALLOWED_DOMAINS)[number];

/** نطاق المرجعية للرابط، أو null لأي نطاق آخر أو رابط غير صالح (المطابقة بالنطاق لا بالنص). */
export function webDomainOf(url: string | undefined, allowed: readonly string[] = WEB_ALLOWED_DOMAINS): WebDomain | null {
  if (!url) return null;
  let host: string;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    host = u.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
  return (allowed.find((d) => host === d || host.endsWith(`.${d}`)) as WebDomain | undefined) ?? null;
}

export function isFatwaDomain(domain: string | null): boolean {
  return Boolean(domain && (WEB_FATWA_DOMAINS as readonly string[]).includes(domain));
}

// ---------------------------------------------------------------------------
// جواب النموذج
// ---------------------------------------------------------------------------

const str = z.preprocess((v) => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v)), z.string());

export const WebAnswerSchema = z.object({
  queries: z.array(str).catch([]).default([]),
  sources: z
    .array(z.object({ url: str, title: str.default(""), site: str.default(""), quote: str.default("") }))
    .catch([])
    .default([]),
  explanation: str.catch("").default(""),
});

export type WebAnswer = z.infer<typeof WebAnswerSchema>;

/** أول كائن JSON في النص (قد يحيط به كلام أو ```json). null إن لم يوجد. */
export function parseWebAnswer(text: string): WebAnswer | null {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const candidates = [t];
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end > start) candidates.push(t.slice(start, end + 1));
  for (const c of candidates) {
    try {
      const parsed = WebAnswerSchema.safeParse(JSON.parse(c));
      if (parsed.success) return parsed.data;
    } catch {
      /* التالي */
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// المحتوى المقروء في الرد الخام
// ---------------------------------------------------------------------------

/** page: محتوى صفحة مقروءة · snippet: مقتطف من نتائج البحث (أو نص قصير). */
export type FetchedPage = { url: string; title?: string; content: string; kind?: "page" | "snippet" };

/** مفاتيح كلام النموذج في رسالته (لا تُقرأ محتوى). */
const MODEL_OWN = /^(?:content|reasoning|reasoning_content|reasoning_details|refusal|tool_calls|function_call)$/;

const URL_KEYS = ["url", "uri", "link", "source_url", "sourceUrl", "href"];
const TEXT_KEYS = ["content", "text", "page_content", "pageContent", "markdown", "body", "extract", "excerpt", "snippet", "raw_content", "highlights", "summary"];
/** مفاتيح المقتطفات (نتائج البحث)، لا محتوى الصفحة. */
const SNIPPET_KEYS = new Set(["extract", "excerpt", "snippet", "highlights", "summary"]);
/** أقل طول لمحتوى يُعدّ صفحة مقروءة (الأقصر مقتطف). */
export const PAGE_MIN_CHARS = 600;

/** مفتاح الرابط للمقارنة: بلا البروتوكول وwww والشرطة الأخيرة وعلامة # ومعطيات التتبع. */
export function urlKey(url: string): string {
  try {
    const u = new URL(url.trim());
    for (const k of [...u.searchParams.keys()]) if (/^utm_|^ref$|^fbclid$/i.test(k)) u.searchParams.delete(k);
    const path = decodeURIComponent(u.pathname).replace(/\/+$/, "");
    return `${u.hostname.toLowerCase().replace(/^www\./, "")}${path}${u.search}`;
  } catch {
    return url.trim();
  }
}

/**
 * يجمع الصفحات المقروءة من الرد الخام: كل كائن فيه رابط ونص (annotations/url_citation، أو نتائج
 * أدوات، أو رسائل tool نصها JSON)، في أي عمق. الجواب النهائي نفسه (choices[].message.content) لا يُعدّ.
 */
export function extractFetched(raw: unknown): FetchedPage[] {
  const pages = new Map<string, FetchedPage>();
  const add = (url: string, content: string, title: string | undefined, snippetKey: boolean) => {
    const c = content.trim();
    if (!/^https?:\/\//i.test(url) || c.length < 20) return;
    const kind: FetchedPage["kind"] = !snippetKey && c.length >= PAGE_MIN_CHARS ? "page" : "snippet";
    const key = urlKey(url);
    const prev = pages.get(key);
    if (!prev) pages.set(key, { url, title, content: c, kind });
    else {
      if (!prev.content.includes(c)) prev.content = kind === "page" && prev.kind !== "page" ? `${c}\n${prev.content}` : `${prev.content}\n${c}`;
      if (kind === "page") prev.kind = "page";
      if (!prev.title && title) prev.title = title;
    }
  };
  const visit = (node: unknown, depth: number, parentKey: string) => {
    if (depth > 9 || node === null || node === undefined) return;
    if (typeof node === "string") {
      // رسالة أداة نصها JSON.
      const t = node.trim();
      if (parentKey !== "arguments" && (t.startsWith("{") || t.startsWith("[")) && t.length < 400_000) {
        try {
          visit(JSON.parse(t), depth + 1, "");
        } catch {
          /* نص عادي */
        }
      }
      return;
    }
    if (typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((n) => visit(n, depth + 1, parentKey));
      return;
    }
    const o = node as Record<string, unknown>;
    const url = URL_KEYS.map((k) => o[k]).find((v): v is string => typeof v === "string");
    if (url) {
      const title = typeof o.title === "string" ? o.title : undefined;
      for (const k of TEXT_KEYS) {
        const v = o[k];
        // highlights: مصفوفة مقتطفات نصية.
        const text = typeof v === "string" ? v : Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]).join("\n") : null;
        if (text) add(url, text, title, SNIPPET_KEYS.has(k));
      }
    }
    const assistant = o.role === "assistant";
    for (const [k, v] of Object.entries(o)) {
      // كلام النموذج نفسه (جوابه وتفكيره وطلبات أدواته) ليس محتوى مقروءاً: وإلا وثّق الاقتباسُ نفسَه.
      if (assistant && MODEL_OWN.test(k)) continue;
      if (v && (typeof v === "object" || typeof v === "string")) visit(v, depth + 1, k);
    }
  };
  visit(raw, 0, "");
  return [...pages.values()];
}

/** استهلاك أدوات الخادم إن ذكره الرد (عدد عمليات البحث والقراءة). */
export function toolUsage(raw: unknown): { searches?: number; fetches?: number } {
  const usage = (raw as { usage?: Record<string, unknown> } | null)?.usage;
  const stu = (usage?.server_tool_use ?? usage?.serverToolUse) as Record<string, unknown> | undefined;
  const num = (v: unknown) => (typeof v === "number" ? v : undefined);
  return {
    searches: num(stu?.web_search_requests) ?? num(stu?.web_search) ?? num(stu?.search_requests),
    fetches: num(stu?.web_fetch_requests) ?? num(stu?.web_fetch) ?? num(stu?.fetch_requests),
  };
}

// ---------------------------------------------------------------------------
// التحقق من الاقتباس
// ---------------------------------------------------------------------------

/** حروف تُهمل في المطابقة: التشكيل وعلامات المصحف والتطويل والمحارف الخفية. */
const IGNORED = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/;

/** توحيد الحرف للمطابقة: الهمزات ألفاً، و ؤ واواً، و ئ ياءً، والألف المقصورة ياءً، والتاء المربوطة هاءً. */
function foldChar(ch: string): string {
  switch (ch) {
    case "أ":
    case "إ":
    case "آ":
    case "ٱ":
      return "ا";
    case "ؤ":
      return "و";
    case "ئ":
    case "ى":
      return "ي";
    case "ة":
      return "ه";
    default:
      return ch.toLowerCase();
  }
}

type Token = { w: string; start: number; end: number };

/**
 * كلمات النص مطبَّعة مع موضع كل كلمة في الأصل: بلا تشكيل ولا تطويل، والهمزات موحّدة، وكل ما ليس
 * حرفاً أو رقماً (الترقيم العربي واللاتيني، والأقواس القرآنية ﴿﴾، وعلامات التنصيص، والمسافات
 * المتعددة) فاصلٌ بين الكلمات.
 */
export function tokenize(text: string): Token[] {
  const src = text.normalize("NFC");
  const out: Token[] = [];
  let w = "";
  let start = -1;
  let end = -1;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (IGNORED.test(ch)) {
      // تشكيل آخر الكلمة جزء منها في العرض بنص الصفحة.
      if (w) end = i;
      continue;
    }
    if (/[\p{L}\p{N}]/u.test(ch)) {
      if (!w) start = i;
      w += foldChar(ch);
      end = i;
    } else if (w) {
      out.push({ w, start, end });
      w = "";
    }
  }
  if (w) out.push({ w, start, end });
  return out;
}

export function normalizeQuote(text: string): string {
  return tokenize(text)
    .map((t) => t.w)
    .join(" ");
}

/** أقل طول للاقتباس المقبول (بعد التطبيع)، وأقل عدد كلمات. */
export const MIN_QUOTE_CHARS = 15;
export const MIN_QUOTE_WORDS = 3;
/** نسبة الكلمات المتتابعة المطلوبة للقبول شبه الحرفي. */
export const NEAR_RATIO = 0.9;

export type QuoteMatch = { text: string | null; match?: "exact" | "near"; ratio: number };

/** طول أطول تتابع مشترك (بالترتيب) ونهايته في b. */
function lcsWithEnd(a: string[], b: string[]): { len: number; lastB: number; firstB: number } {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  }
  // أول وآخر موضع مطابق في b (للعرض بنص الصفحة).
  let i = n;
  let j = m;
  let lastB = -1;
  let firstB = -1;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      if (lastB === -1) lastB = j - 1;
      firstB = j - 1;
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  return { len: dp[n][m], lastB, firstB };
}

/**
 * يجد الاقتباس في المحتوى بعد التطبيع: حرفياً (كل الكلمات متتالية)، أو شبه حرفي (90% من كلماته
 * متتابعة بالترتيب في موضع واحد من الصفحة). يعيد النص كما في الصفحة، ونسبة أفضل تطابق ولو رُفض.
 */
export function matchQuote(quote: string, content: string): QuoteMatch {
  const q = tokenize(quote).map((t) => t.w);
  if (q.length < MIN_QUOTE_WORDS || q.join(" ").length < MIN_QUOTE_CHARS) return { text: null, ratio: 0 };
  const page = tokenize(content);
  const words = page.map((t) => t.w);
  const original = content.normalize("NFC");
  const span = (a: number, b: number) => original.slice(page[a].start, page[b].end + 1);

  // حرفياً: كل الكلمات متتالية.
  for (let i = 0; i + q.length <= words.length; i++) {
    if (words[i] !== q[0]) continue;
    let k = 1;
    while (k < q.length && words[i + k] === q[k]) k++;
    if (k === q.length) return { text: span(i, i + q.length - 1), match: "exact", ratio: 1 };
  }

  // شبه حرفي: نافذة تبدأ عند إحدى كلمات الاقتباس الأولى، وطولها أكبر قليلاً من الاقتباس.
  const heads = new Set(q.slice(0, 3));
  const size = Math.ceil(q.length * 1.15) + 2;
  let best = { ratio: 0, first: -1, last: -1 };
  for (let i = 0; i < words.length; i++) {
    if (!heads.has(words[i])) continue;
    const window = words.slice(i, i + size);
    const { len, firstB, lastB } = lcsWithEnd(q, window);
    const ratio = len / q.length;
    if (ratio > best.ratio) best = { ratio, first: i + firstB, last: i + lastB };
    if (best.ratio === 1) break;
  }
  if (best.ratio >= NEAR_RATIO && best.first >= 0) return { text: span(best.first, best.last), match: "near", ratio: best.ratio };
  return { text: null, ratio: best.ratio };
}

/** الاقتباس بنص الصفحة إن وُجد (حرفياً أو شبه حرفي)، أو null. */
export function locateVerbatim(quote: string, content: string): string | null {
  return matchQuote(quote, content).text;
}

export type WebSource = {
  url: string;
  title: string;
  /** اسم الموقع من نطاقه (لا من كلام النموذج). */
  site: string;
  domain: WebDomain;
  /** الاقتباس بنص الصفحة المقروءة (للموثَّق فقط). */
  quote?: string;
  status: "verified" | "link_only";
  /**
   * extracted: فقرة من الصفحة المقروءة يقتطعها الكود · snippet: مقتطف البحث من الصفحة ·
   * exact/near: اقتباس النموذج موجوداً حرفياً أو شبه حرفي (≥ 90% من كلماته متتابعة).
   */
  match?: "extracted" | "snippet" | "exact" | "near";
  /** النص مقتطف من نتائج البحث (لم تُقرأ الصفحة كاملة): يُعرض بعلامة «مقتطف من الصفحة». */
  snippet?: boolean;
  /** نسبة أفضل تطابق للاقتباس (للتشخيص، ولو رُفض). */
  ratio?: number;
  /**
   * سبب «رابط فقط»: لا محتوى مقروء في الرد لهذا الرابط، أو الاقتباس غير موجود فيه، أو فارغ،
   * أو من نتائج البحث وحدها (لم تُقرأ الصفحة).
   */
  reason?: "no_content" | "not_found" | "empty_quote" | "search_only";
};

export type WebDropped = { url: string; reason: "domain" | "invalid_url" | "duplicate" };

export const MAX_WEB_SOURCES = 4;
const QUOTE_MAX = 1200;
/** أقصى طول لمقتطف البحث المعروض. */
const SNIPPET_MAX = 600;

const clipText = (t: string, max: number) => {
  if (t.length <= max) return t;
  const space = t.lastIndexOf(" ", max);
  return `${t.slice(0, space > max * 0.6 ? space : max).trimEnd()}…`;
};

/**
 * النص الحرفي لرابط من محتواه المقروء، يقتطعه الكود (لا النموذج):
 *  - صفحة مقروءة: أفضل فقرة أو فقرتين لكلمات السؤال (extracted).
 *  - مقتطف بحث: نصه كما أعادته أداة البحث (snippet)، بعلامة «مقتطف من الصفحة».
 *  - وإلا اقتباس النموذج إن وُجد حرفياً أو شبه حرفي في المحتوى (exact/near).
 * null إن لم يتوفر نص.
 */
export function textFromPage(
  page: FetchedPage,
  terms: string[],
  modelQuote = "",
): { quote: string; match: NonNullable<WebSource["match"]>; ratio?: number; snippet?: boolean } | { quote: null; ratio: number } {
  const kind = page.kind ?? (page.content.length >= PAGE_MIN_CHARS ? "page" : "snippet");
  if (kind === "page") {
    const best = bestParagraphs(page.content, terms);
    if (best) return { quote: clipText(best.text, QUOTE_MAX), match: "extracted", ratio: best.ratio };
  }
  let ratio = 0;
  if (modelQuote.trim()) {
    const m = matchQuote(modelQuote, page.content);
    ratio = Math.round(m.ratio * 100) / 100;
    if (m.text) return { quote: clipText(m.text, QUOTE_MAX), match: m.match ?? "exact", ratio, ...(kind === "snippet" ? { snippet: true } : {}) };
  }
  if (kind === "snippet") {
    // مقتطف البحث نص حرفي من الصفحة: يُستعمل كما هو إن كان فيه كلمة من السؤال (أو لا كلمات للمقارنة).
    if (!terms.length || bestParagraphs(page.content, terms, { count: 1, maxChars: 10_000 })) {
      return { quote: clipText(page.content.replace(/\s+/g, " ").trim(), SNIPPET_MAX), match: "snippet", snippet: true };
    }
  }
  return { quote: null, ratio };
}

/** مصدر من المحتوى المقروء أو «رابط فقط» إن لم يتوفر نص. */
function sourceFor(base: Omit<WebSource, "status">, page: FetchedPage | undefined, terms: string[], modelQuote: string): WebSource {
  if (!page) return { ...base, status: "link_only", reason: modelQuote.trim() ? "no_content" : "empty_quote" };
  const t = textFromPage(page, terms, modelQuote);
  if (t.quote === null) return { ...base, status: "link_only", reason: modelQuote.trim() ? "not_found" : "empty_quote", ratio: t.ratio };
  return { ...base, status: "verified", quote: t.quote, match: t.match, ...(t.ratio !== undefined ? { ratio: t.ratio } : {}), ...(t.snippet ? { snippet: true } : {}) };
}

/**
 * يطبّق الفلتر والنص الحرفي على جواب النموذج. terms: كلمات السؤال (لاقتطاع الفقرة الأقرب).
 * ثم الصفحات المقروءة التي لم يذكرها النموذج، ما بقي مكان.
 */
export function verifyWebAnswer(
  answer: WebAnswer,
  fetched: FetchedPage[],
  allowed: readonly string[] = WEB_ALLOWED_DOMAINS,
  terms: string[] = [],
): { sources: WebSource[]; dropped: WebDropped[] } {
  const sources: WebSource[] = [];
  const dropped: WebDropped[] = [];
  const seen = new Set<string>();
  const byKey = new Map(fetched.map((p) => [urlKey(p.url), p]));
  for (const s of answer.sources) {
    if (sources.length >= MAX_WEB_SOURCES) break;
    const url = s.url.trim();
    let valid = false;
    try {
      valid = /^https?:$/.test(new URL(url).protocol);
    } catch {
      valid = false;
    }
    if (!valid) {
      dropped.push({ url, reason: "invalid_url" });
      continue;
    }
    const domain = webDomainOf(url, allowed);
    if (!domain) {
      dropped.push({ url, reason: "domain" });
      continue;
    }
    const key = urlKey(url);
    if (seen.has(key)) {
      dropped.push({ url, reason: "duplicate" });
      continue;
    }
    seen.add(key);
    const page = byKey.get(key);
    const title = (s.title.trim() || page?.title?.trim() || WEB_SITE_NAMES[domain]).slice(0, 200);
    sources.push(sourceFor({ url, title, site: WEB_SITE_NAMES[domain], domain }, page, terms, s.quote));
  }
  // الصفحات المقروءة في نطاق المرجعية ولم يذكرها النموذج (بنصها فقط).
  for (const extra of sourcesFromPages(fetched, terms, allowed, seen)) {
    if (sources.length >= MAX_WEB_SOURCES) break;
    sources.push(extra);
  }
  return { sources, dropped };
}

/**
 * مصادر من المحتوى المقروء وحده (بلا جواب النموذج، أو لم يذكرها): الصفحات أولاً ثم المقتطفات،
 * وما لا نص فيه يُترك. يستعمله فشل الصيغة (لا JSON) والبحث بلا قراءة.
 */
export function sourcesFromPages(
  pages: FetchedPage[],
  terms: string[],
  allowed: readonly string[] = WEB_ALLOWED_DOMAINS,
  seen: Set<string> = new Set(),
): WebSource[] {
  const out: WebSource[] = [];
  const ordered = [...pages].sort((a, b) => (a.kind === "page" ? 0 : 1) - (b.kind === "page" ? 0 : 1));
  for (const p of ordered) {
    if (out.length >= MAX_WEB_SOURCES) break;
    const domain = webDomainOf(p.url, allowed);
    const key = urlKey(p.url);
    if (!domain || seen.has(key)) continue;
    const s = sourceFor({ url: p.url, title: (p.title?.trim() || WEB_SITE_NAMES[domain]).slice(0, 200), site: WEB_SITE_NAMES[domain], domain }, p, terms, "");
    if (s.status !== "verified") continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * مصادر البحث وحده (حين لم تُقرأ الصفحات أو اقتربت المهلة): ما ذكره النموذج من الروابط، ثم ما في
 * نتائج أداة البحث نفسها في الرد الخام. مقتطف البحث نص حرفي من الصفحة («مقتطف من الصفحة»)،
 * و«رابط فقط» لما لا نص له.
 */
export function searchOnlySources(
  answer: WebAnswer | null,
  pages: FetchedPage[],
  allowed: readonly string[] = WEB_ALLOWED_DOMAINS,
  terms: string[] = [],
): WebSource[] {
  const out: WebSource[] = [];
  const seen = new Set<string>();
  const byKey = new Map(pages.map((p) => [urlKey(p.url), p]));
  const add = (url: string, title: string | undefined) => {
    const domain = webDomainOf(url, allowed);
    const key = urlKey(url);
    if (!domain || seen.has(key) || out.length >= MAX_WEB_SOURCES) return;
    seen.add(key);
    const base = { url, title: (title?.trim() || byKey.get(key)?.title?.trim() || WEB_SITE_NAMES[domain]).slice(0, 200), site: WEB_SITE_NAMES[domain], domain };
    const page = byKey.get(key);
    const s = page ? sourceFor(base, page, terms, "") : null;
    out.push(s && s.status === "verified" ? s : { ...base, status: "link_only", reason: "search_only" });
  };
  for (const s of answer?.sources ?? []) add(s.url.trim(), s.title);
  for (const p of pages) add(p.url, p.title);
  // ما له نص أولاً.
  return out.sort((a, b) => (a.status === "verified" ? 0 : 1) - (b.status === "verified" ? 0 : 1));
}
