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

// ---------------------------------------------------------------------------
// صفحات تُرسم نتائجها بـ JavaScript: البيانات المضمّنة في الصفحة
// ---------------------------------------------------------------------------

/** كتل JSON المضمّنة في الصفحة (__NEXT_DATA__ وapplication/json وJSON-LD). */
export function embeddedJson(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script\b[^>]*type=["']application\/(?:ld\+)?json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) && out.length < 10) {
    try {
      out.push(JSON.parse(match[1]));
    } catch {
      /* كتلة غير صالحة */
    }
  }
  return out;
}

/**
 * يجمع من JSON المضمّن كل كائن له عنوان ورابط أو معرّف رقمي، ويبني الرابط بـ idUrl
 * إن لم يكن فيه رابط. مفيد للمواقع التي ترسل النتائج داخل الصفحة وترسمها بـ JavaScript.
 */
export function linksFromJson(
  data: unknown,
  baseUrl: string,
  idUrl: ((id: string) => string) | undefined,
  limit = 5,
): ExtractedLink[] {
  const out: ExtractedLink[] = [];
  const seen = new Set<string>();
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
  const visit = (node: unknown, depth: number) => {
    if (out.length >= limit || depth > 8 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach((n) => visit(n, depth + 1));
    const o = node as Record<string, unknown>;
    const title = str(o.title ?? o.question ?? o.name ?? o.headline);
    const href = str(o.url ?? o.link ?? o.href ?? o.permalink ?? o.slug_url);
    const id = str(o.id ?? o.answer_id ?? o.fatwa_id ?? o.reference);
    let url = "";
    if (href) {
      try {
        url = new URL(href, baseUrl).toString();
      } catch {
        url = "";
      }
    } else if (idUrl && /^\d{2,}$/.test(id)) {
      url = new URL(idUrl(id), baseUrl).toString();
    }
    if (title.length >= 3 && url && new URL(url).hostname === new URL(baseUrl).hostname && !seen.has(url)) {
      seen.add(url);
      const text = str(o.summary ?? o.excerpt ?? o.description ?? o.question ?? o.body ?? o.content);
      out.push({ url, title: clip(htmlToText(title), 160), snippet: clip(htmlToText(text), 320) });
    }
    Object.values(o).forEach((v) => visit(v, depth + 1));
  };
  visit(data, 0);
  return out;
}

/** نماذج البحث في الصفحة: رابط الإرسال وأسماء الحقول (لاكتشاف صيغة البحث الصحيحة). */
export function searchForms(html: string, baseUrl: string): { action: string; field: string }[] {
  const out: { action: string; field: string }[] = [];
  const re = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) && out.length < 5) {
    const action = match[1].match(/action\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
    if (/method\s*=\s*["']post["']/i.test(match[1])) continue;
    const inputs = [...match[2].matchAll(/<input\b([^>]*)>/gi)].map((m) => m[1]);
    const text = inputs.find((a) => /type\s*=\s*["'](search|text)["']/i.test(a) || !/type\s*=/i.test(a));
    const field = text?.match(/name\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!field) continue;
    try {
      out.push({ action: new URL(decodeEntities(action) || baseUrl, baseUrl).toString(), field });
    } catch {
      /* رابط غير صالح */
    }
  }
  return out;
}

/** رابط وصف OpenSearch إن أعلنه الموقع. */
export function openSearchHref(html: string, baseUrl: string): string | null {
  const tag = html.match(/<link\b[^>]*type=["']application\/opensearchdescription\+xml["'][^>]*>/i)?.[0];
  const href = tag?.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
  if (!href) return null;
  try {
    return new URL(decodeEntities(href), baseUrl).toString();
  } catch {
    return null;
  }
}

/** ملخص تشخيصي لصفحة بحث (لـ /api/health?debug=1). لا يُحفظ شيء من الصفحة. */
export function inspectPage(html: string, baseUrl: string) {
  const numeric = sampleLinks(html, baseUrl, 400).filter((p) => /\/\d{2,}/.test(p) && !/[?&]page=/.test(p));
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n");
  const apiHints = [
    ...new Set(
      [...scripts.matchAll(/["'`]((?:https?:\/\/[^"'`\s]+)?\/[^"'`\s]*(?:api|ajax|search)[^"'`\s]{0,80})["'`]/gi)].map((m) => m[1]),
    ),
  ].slice(0, 12);
  return {
    bytes: html.length,
    title: htmlToText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").slice(0, 120),
    anchors: (html.match(/<a\b/gi) ?? []).length,
    numericLinks: numeric.slice(0, 15),
    forms: searchForms(html, baseUrl),
    openSearch: openSearchHref(html, baseUrl),
    nextData: /id=["']__NEXT_DATA__["']/.test(html),
    jsonBlocks: embeddedJson(html).length,
    apiHints,
  };
}
