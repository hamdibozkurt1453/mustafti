/**
 * شكل الجواب (نقي، يُختبر محلياً): الجملة الأولى جواب مباشر بكلام الأداة مع إشارة [n]،
 * لا اقتباس ولا ﴿ ولا مرجع مجرد («البقرة 127: ﴿…﴾»). يستعمله respond.ts (إعادة صياغة مرة
 * واحدة إن خالف) وbrain-test (فحص format).
 */
import { matchKey } from "./guard";

/** الجملة الأولى مع إشارات [n] التي تليها مباشرة. */
export function firstSentence(text: string): string {
  const t = text.trim();
  const end = t.search(/[.!؟?۔\n]/);
  if (end === -1) return t;
  const rest = t.slice(end + 1).match(/^\s*(?:\[\s*\d{1,2}\s*\]\s*)+/)?.[0] ?? "";
  return t.slice(0, end + 1) + rest;
}

export type FormatIssue = "starts_with_quote" | "starts_with_reference" | "no_citation";

/** مخالفات شكل الجملة الأولى (فارغة = سليم). */
export function answerFormatIssues(text: string): FormatIssue[] {
  const fs = firstSentence(text);
  const issues: FormatIssue[] = [];
  if (/^[«"“„'﴿(\[{]/u.test(fs)) issues.push("starts_with_quote");
  // «البقرة 127:» أو «2:127» أو «سورة البقرة (127)» في أول الجواب.
  else if (/^(?:سورة\s+)?[\p{L}\p{M}'\-ـ ]{0,24}?\(?\s*\d{1,3}\s*(?:[:：]\s*\d{1,3})?\s*\)?\s*[:：]/u.test(fs) || /^\d{1,3}\s*[:：]\s*\d{1,3}/.test(fs)) {
    issues.push("starts_with_reference");
  }
  if (!/\[\s*\d{1,2}\s*\]/.test(fs)) issues.push("no_citation");
  return issues;
}

/** مصادر مرجعية تُحال إليها ولا تُقتبس: فهرس سور المصحف، وقاموس المرجعية. */
const REFERENCE_ONLY = /^(?:فهرس سور المصحف|المرجعية العلمية — قاموس)/;

/**
 * قسم الاقتباس للآية والحديث و«بيّنات» فقط: «…» الذي نصه من الفهرس أو القاموس وحدهما
 * تُزال أقواسه، والسطر الذي لا يبقى فيه إلا ذلك الاقتباس وإشاراته (تكرار للجملة الأولى) يُحذف.
 */
export function unquoteReferenceOnly(text: string, passages: { text: string; source: string }[]): string {
  const refs = passages.filter((p) => REFERENCE_ONLY.test(p.source)).map((p) => matchKey(p.text));
  const evidence = passages.filter((p) => !REFERENCE_ONLY.test(p.source)).map((p) => matchKey(p.text));
  if (!refs.length) return text;
  const isRefOnly = (quote: string) => {
    const k = matchKey(quote);
    return k.length >= 6 && refs.some((r) => r.includes(k)) && !evidence.some((e) => e.includes(k));
  };
  return text
    .split("\n")
    .flatMap((line) => {
      const quotes = [...line.matchAll(/«([^«»]+)»/g)].filter((m) => isRefOnly(m[1]));
      if (!quotes.length) return [line];
      const rest = quotes.reduce((l, m) => l.replace(m[0], ""), line);
      if (!rest.replace(/\[\s*\d{1,2}\s*\]|[\s.,،:؛()\-—]/g, "")) return [];
      return [quotes.reduce((l, m) => l.replace(m[0], m[1]), line)];
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * توحيد إشارات المصادر (R1e): بعض النماذج تكتب «[1, 2]» أو «[1،2]» أو «[1-3]» أو «【1】» أو «[S1]»
 * بدل «[1][2]»، فكان الجواب يُعدّ بلا إسناد فيُمتنع عنه. تُحوَّل كلها إلى «[n]» متتالية.
 */
export function normalizeCitations(text: string): string {
  return text
    .replace(/[【［]\s*(\d{1,2})\s*[】］]/g, "[$1]")
    .replace(/\[\s*S(\d{1,2})\s*\]/gi, "[$1]")
    .replace(/\[\s*(\d{1,2}(?:\s*(?:[,،؛;]|و|and|-|–|—)\s*\d{1,2})+)\s*\]/g, (_m, list: string) => {
      const out: number[] = [];
      const parts = list.split(/\s*(?:[,،؛;]|و|and)\s*/);
      for (const p of parts) {
        const range = p.match(/^(\d{1,2})\s*[-–—]\s*(\d{1,2})$/);
        if (range) {
          const [a, b] = [Number(range[1]), Number(range[2])];
          for (let n = a; n <= Math.min(b, a + 9); n++) out.push(n);
        } else if (/^\d{1,2}$/.test(p.trim())) out.push(Number(p.trim()));
      }
      return out.length ? out.map((n) => `[${n}]`).join("") : _m;
    });
}

/** إشارات [n] الصحيحة في النص (بين 1 وعدد النصوص). */
export function validCitations(text: string, count: number): number[] {
  return [...normalizeCitations(text).matchAll(/\[\s*(\d{1,2})\s*\]/g)].map((m) => Number(m[1])).filter((n) => n >= 1 && n <= count);
}

/**
 * جواب جزئي فيه جملة الامتناع (R1e): النموذج كتب «لم أجد جواباً كافياً…» ثم أجاب من النصوص بإشاراتها.
 * تُحذف جملة الامتناع (فهي تناقض ما بعدها)، ويبقى الجواب. null إن لم توجد الجملة.
 */
export function stripAbstainSentence(text: string, phrases: string[]): string | null {
  const keys = phrases.map((p) => matchKey(p).replace(/\s*[.。]$/, "")).filter(Boolean);
  const sentences = text.split(/(?<=[.!؟?۔\n])/u);
  let found = false;
  const kept = sentences.filter((s) => {
    const k = matchKey(s);
    const hit = keys.some((p) => k.includes(p));
    if (hit && !/\[\s*\d{1,2}\s*\]/.test(s)) {
      found = true;
      return false;
    }
    return true;
  });
  if (!found) return null;
  return kept.join("").replace(/^[\s,،:؛—-]+/, "").replace(/\n{3,}/g, "\n\n").trim();
}
