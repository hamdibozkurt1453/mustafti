/**
 * شكل الجواب (نقي، يُختبر محلياً): الجملة الأولى جواب مباشر بكلام الأداة مع إشارة [n]،
 * لا اقتباس ولا ﴿ ولا مرجع مجرد («البقرة 127: ﴿…﴾»). يستعمله respond.ts (إعادة صياغة مرة
 * واحدة إن خالف) وbrain-test (فحص format).
 */

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
