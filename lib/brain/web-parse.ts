import { z } from "zod";
import { WEB_ALLOWED_DOMAINS, WEB_FATWA_DOMAINS, WEB_SITE_NAMES } from "@/lib/sources/registry";

/**
 * طبقة «ابحث واقرأ» — الجزء النقي (يُختبر محلياً بردود مسجّلة):
 *  - قراءة جواب النموذج (JSON): عبارات البحث، والمصادر {url, title, site, quote}، والشرح.
 *  - فلتر النطاقات: كل رابط خارج نطاقات المرجعية (WEB_ALLOWED_DOMAINS) يُحذف، ولو أعاده النموذج.
 *  - المحتوى المقروء: ما أعادته أداة web_fetch في الرد الخام (إن توفّر)، من أي موضع فيه.
 *  - التحقق من الاقتباس: يجب أن يوجد حرفياً (بعد تطبيع المسافات والتشكيل) في المحتوى المقروء
 *    لرابطه نفسه، ويُعرض بنص الصفحة لا بنص النموذج. وإلا فالمصدر «رابط فقط» بلا اقتباس.
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

export type FetchedPage = { url: string; title?: string; content: string };

/** مفاتيح كلام النموذج في رسالته (لا تُقرأ محتوى). */
const MODEL_OWN = /^(?:content|reasoning|reasoning_content|reasoning_details|refusal|tool_calls|function_call)$/;

const URL_KEYS = ["url", "uri", "link", "source_url", "sourceUrl", "href"];
const TEXT_KEYS = ["content", "text", "page_content", "pageContent", "markdown", "body", "extract", "excerpt", "snippet", "raw_content"];

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
  const add = (url: string, content: string, title?: string) => {
    const c = content.trim();
    if (!/^https?:\/\//i.test(url) || c.length < 20) return;
    const key = urlKey(url);
    const prev = pages.get(key);
    if (!prev) pages.set(key, { url, title, content: c });
    else if (!prev.content.includes(c)) prev.content = `${prev.content}\n${c}`;
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
      const texts = TEXT_KEYS.map((k) => o[k]).filter((v): v is string => typeof v === "string");
      for (const t of texts) add(url, t, typeof o.title === "string" ? o.title : undefined);
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
const IGNORED = /[ؐ-ًؚ-ٰٟۖ-ۭـ​-‏‪-‮⁦-⁩﻿]/;

/** النص مطبَّعاً (بلا تشكيل، والمسافات مسافة واحدة) مع موضع كل حرف في الأصل. */
function normalizeWithMap(text: string): { norm: string; map: number[] } {
  const src = text.normalize("NFC");
  let norm = "";
  const map: number[] = [];
  let space = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (IGNORED.test(ch)) continue;
    if (/\s/.test(ch)) {
      if (!space && norm.length) {
        norm += " ";
        map.push(i);
      }
      space = true;
      continue;
    }
    space = false;
    norm += ch;
    map.push(i);
  }
  if (norm.endsWith(" ")) {
    norm = norm.slice(0, -1);
    map.pop();
  }
  return { norm, map };
}

export function normalizeQuote(text: string): string {
  return normalizeWithMap(text).norm;
}

/** أقل طول للاقتباس المقبول (بعد التطبيع). */
export const MIN_QUOTE_CHARS = 15;

/**
 * يجد الاقتباس حرفياً في المحتوى (بعد تطبيع المسافات والتشكيل)، ويعيد نصه كما في الصفحة،
 * أو null. علامات التنصيص حول الاقتباس كله لا تُعدّ منه.
 */
export function locateVerbatim(quote: string, content: string): string | null {
  const q = normalizeQuote(quote.trim().replace(/^[«"“'﴿]+|[»"”'﴾]+$/g, ""));
  if (q.length < MIN_QUOTE_CHARS) return null;
  const { norm, map } = normalizeWithMap(content);
  const at = norm.indexOf(q);
  if (at === -1) return null;
  const startIdx = map[at];
  const endIdx = map[at + q.length - 1];
  return content.normalize("NFC").slice(startIdx, endIdx + 1);
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
  /** سبب «رابط فقط»: لا محتوى مقروء في الرد لهذا الرابط، أو الاقتباس غير موجود فيه، أو فارغ. */
  reason?: "no_content" | "not_found" | "empty_quote";
};

export type WebDropped = { url: string; reason: "domain" | "invalid_url" | "duplicate" };

export const MAX_WEB_SOURCES = 4;
const QUOTE_MAX = 1200;

/** يطبّق الفلتر والتحقق على جواب النموذج. */
export function verifyWebAnswer(
  answer: WebAnswer,
  fetched: FetchedPage[],
  allowed: readonly string[] = WEB_ALLOWED_DOMAINS,
): { sources: WebSource[]; dropped: WebDropped[] } {
  const sources: WebSource[] = [];
  const dropped: WebDropped[] = [];
  const seen = new Set<string>();
  const byKey = new Map(fetched.map((p) => [urlKey(p.url), p]));
  for (const s of answer.sources) {
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
    const base = { url, title, site: WEB_SITE_NAMES[domain], domain };
    if (!s.quote.trim()) sources.push({ ...base, status: "link_only", reason: "empty_quote" });
    else if (!page) sources.push({ ...base, status: "link_only", reason: "no_content" });
    else {
      const exact = locateVerbatim(s.quote, page.content);
      sources.push(
        exact
          ? { ...base, status: "verified", quote: exact.length > QUOTE_MAX ? `${exact.slice(0, QUOTE_MAX)}…` : exact }
          : { ...base, status: "link_only", reason: "not_found" },
      );
    }
    if (sources.length >= MAX_WEB_SOURCES) break;
  }
  return { sources, dropped };
}
