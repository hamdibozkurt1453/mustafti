/**
 * أدوات صغيرة لاستخراج نتائج البحث من صفحة HTML دون مكتبات:
 * عنوان كل نتيجة، ومقتطف قصير بعدها، ورابطها. الصفحة نفسها لا تُحفظ.
 */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  laquo: "«",
  raquo: "»",
  hellip: "…",
  ndash: "–",
  mdash: "—",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** يحذف الوسوم والسكربتات ويضغط المسافات. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function clip(text: string, max = 400): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > max * 0.6 ? space : max)}…`;
}

export type ExtractedLink = { url: string; title: string; snippet: string };

/**
 * يجمع روابط النتائج التي يطابق مسارها linkPattern (مثل /answers/\d+)،
 * بلا تكرار، ومع مقتطف من النص الذي يلي الرابط في الصفحة.
 */
export function extractResultLinks(
  html: string,
  baseUrl: string,
  linkPattern: RegExp,
  options: { limit?: number; snippetChars?: number } = {},
): ExtractedLink[] {
  const limit = options.limit ?? 5;
  const snippetChars = options.snippetChars ?? 320;
  const body = html.replace(/<(script|style|noscript|svg|template)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const anchor = /<a\b[^>]*?href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set<string>();
  const out: ExtractedLink[] = [];

  let match: RegExpExecArray | null;
  while ((match = anchor.exec(body)) && out.length < limit) {
    let url: URL;
    try {
      url = new URL(decodeEntities(match[1]), baseUrl);
    } catch {
      continue;
    }
    if (!linkPattern.test(url.pathname)) continue;
    url.hash = "";
    const key = url.origin + url.pathname;
    const title = htmlToText(match[2]);
    if (seen.has(key) || title.length < 3) continue;
    seen.add(key);

    // المقتطف: نص ما بعد الرابط حتى الرابط التالي (أو حد ثابت).
    const after = body.slice(anchor.lastIndex, anchor.lastIndex + 4000);
    const snippet = clip(htmlToText(after.split(/<a\b/i)[0]), snippetChars);
    out.push({ url: url.toString(), title: clip(title, 160), snippet });
  }
  return out;
}

/** قائمة أول الروابط في الصفحة على الموقع نفسه (لتشخيص صيغة النتائج في /api/health?debug=1). */
export function sampleLinks(html: string, baseUrl: string, max = 12): string[] {
  const base = new URL(baseUrl);
  const out = new Set<string>();
  const anchor = /<a\b[^>]*?href\s*=\s*["']([^"'#]+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = anchor.exec(html)) && out.size < max) {
    try {
      const url = new URL(decodeEntities(match[1]), base);
      if (url.hostname === base.hostname && url.pathname.length > 1) out.add(url.pathname + url.search);
    } catch {
      /* رابط غير صالح */
    }
  }
  return [...out];
}
