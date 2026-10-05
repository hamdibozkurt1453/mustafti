/**
 * بطاقات «فتاوى منشورة ذات صلة» (نقي، يُختبر محلياً).
 *
 * الفتوى تُعرض بنصها كما نُشر: العنوان، والمفتي أو الجهة، ومقتطف حرفي من الجواب (حتى 400 حرف)
 * بشارة «نص منقول»، والرابط الأصلي. الأداة لا تلخّص الحكم ولا تطبّقه على حالة السائل، والحارس
 * يفحص كلام الأداة وحده لا النص المنقول.
 */

export const FATWA_EXCERPT_CHARS = 400;
/** أقصى عدد للبطاقات تحت الجواب (A/B/C) وفي الحالة الشخصية (D). */
export const MAX_FATWA_CARDS = 3;

export type FatwaCard = {
  title: string;
  mufti: string;
  /** مقتطف حرفي من أول الجواب المنشور (≤ 400 حرف، ثم «…» إن قُطع). */
  excerpt: string;
  url: string;
  category?: string;
  /** درجة الصلة من 0 إلى 100. */
  score?: number;
};

/** مقتطف حرفي: أول الجواب حتى 400 حرف، مقطوعاً عند آخر مسافة، ثم «…». لا تغيير في الحروف. */
export function fatwaExcerpt(answer: string, max = FATWA_EXCERPT_CHARS): string {
  const t = answer.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > max * 0.6 ? space : max).trimEnd()}…`;
}

export function toFatwaCard(c: {
  title: string;
  url: string;
  score?: number;
  fatwa?: { mufti: string; answer: string; category?: string };
}): FatwaCard | null {
  if (!c.fatwa?.answer) return null;
  return {
    title: c.title,
    mufti: c.fatwa.mufti,
    excerpt: fatwaExcerpt(c.fatwa.answer),
    url: c.url,
    ...(c.fatwa.category ? { category: c.fatwa.category } : {}),
    ...(c.score !== undefined ? { score: c.score } : {}),
  };
}
