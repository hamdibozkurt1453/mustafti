import { keywords } from "./rank";

/**
 * المقتطف الحرفي يقتطعه الكود لا النموذج (R1d): أقرب فقرة أو فقرتين من النص لكلمات السؤال.
 * النص المعاد شريحة من الأصل بحروفه (substring)، فلا يمكن أن يكون صياغة. نقي، يُختبر محلياً.
 * يستعمله موصّل «الإسلام سؤال وجواب» المحلي، وصفحات «ابحث واقرأ» المقروءة.
 */

/** أقصى طول للفقرة الواحدة: الأطول تُقسَّم جملاً متتالية. */
export const PARAGRAPH_MAX = 700;

/** حدود الفقرات في النص: بالأسطر، ثم الطويلة جملاً متتالية حتى PARAGRAPH_MAX. مواضع [start, end). */
export function paragraphSpans(text: string, max = PARAGRAPH_MAX): [number, number][] {
  const out: [number, number][] = [];
  const pushTrimmed = (a: number, b: number) => {
    while (a < b && /\s/.test(text[a])) a++;
    while (b > a && /\s/.test(text[b - 1])) b--;
    if (b - a >= 2) out.push([a, b]);
  };
  const lines = /[^\n]+/g;
  for (let m = lines.exec(text); m; m = lines.exec(text)) {
    const start = m.index;
    const end = start + m[0].length;
    if (end - start <= max) {
      pushTrimmed(start, end);
      continue;
    }
    // جمل السطر الطويل: تنتهي بنقطة أو علامة استفهام أو تعجب أو فاصلة منقوطة يليها فراغ.
    const ends: number[] = [];
    const re = /[.!؟?؛;](?=\s)/gu;
    re.lastIndex = start;
    for (let s = re.exec(text); s && s.index < end; s = re.exec(text)) ends.push(s.index + 1);
    ends.push(end);
    let a = start;
    let last = start;
    for (const e of ends) {
      if (e - a > max && last > a) {
        pushTrimmed(a, last);
        a = last;
      }
      // جملة واحدة أطول من الحد: تُقطع عند آخر مسافة قبله.
      while (e - a > max) {
        const cut = text.lastIndexOf(" ", a + max);
        const b = cut > a + max * 0.5 ? cut : a + max;
        pushTrimmed(a, b);
        a = b;
      }
      last = e;
    }
    if (last > a) pushTrimmed(a, last);
  }
  return out;
}

export function paragraphs(text: string, max = PARAGRAPH_MAX): string[] {
  return paragraphSpans(text, max).map(([a, b]) => text.slice(a, b));
}

/** هل في الفقرة الكلمة (أو صيغة منها: «الصلاة» ← «صلاه»، "mortgages" ← "mortgage")؟ */
function has(words: string[], term: string): boolean {
  return words.some((w) => w === term || (term.length >= 4 && w.includes(term)) || (w.length >= 4 && term.includes(w) && w.length >= term.length - 2));
}

/** كم كلمة من كلمات السؤال (بلا تكرار) في الفقرة. */
export function coverage(text: string, terms: string[]): number {
  const words = keywords(text);
  return terms.filter((t) => has(words, t)).length;
}

export type Excerpt = { text: string; covered: number; ratio: number };

/**
 * أفضل فقرة (أو فقرتين) لكلمات السؤال، بترتيبها في النص. الثانية تُضاف إن غطّت نصف ما غطّته الأولى
 * على الأقل وبقي الطول في الحد. null إن لم تغطِّ أي فقرة كلمة واحدة.
 */
export function bestParagraphs(text: string, terms: string[], opts: { count?: number; maxChars?: number } = {}): Excerpt | null {
  const want = [...new Set(terms.filter(Boolean))];
  if (!text.trim() || !want.length) return null;
  const count = opts.count ?? 2;
  const maxChars = opts.maxChars ?? 1000;
  const spans = paragraphSpans(text);
  const scored = spans.map(([a, b], i) => ({ i, a, b, c: coverage(text.slice(a, b), want) }));
  const ranked = [...scored].sort((x, y) => y.c - x.c || x.b - x.a - (y.b - y.a) || x.i - y.i);
  const best = ranked[0];
  if (!best || best.c === 0) return null;
  const chosen = [best];
  let size = best.b - best.a;
  for (const r of ranked.slice(1)) {
    if (chosen.length >= count) break;
    if (r.c * 2 < best.c || r.c === 0 || size + (r.b - r.a) > maxChars) continue;
    chosen.push(r);
    size += r.b - r.a;
  }
  chosen.sort((x, y) => x.i - y.i);
  const covered = coverage(chosen.map((x) => text.slice(x.a, x.b)).join(" "), want);
  return {
    text: chosen.map((x) => text.slice(x.a, x.b)).join("\n"),
    covered,
    ratio: Math.round((covered / want.length) * 100) / 100,
  };
}

/** أول فقرة من النص (احتياط حين لا تغطّي أي فقرة كلمات السؤال). */
export function firstParagraph(text: string): string {
  return paragraphs(text)[0] ?? "";
}
