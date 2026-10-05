import { looksLikeCode } from "@/lib/brain/rank";

/**
 * عرض بطاقات «فتوى منشورة» (R5): المقتطف الذي فيه بقايا كود (JSON-LD أو HTML) يُعدّ فارغاً، والفتوى
 * بلا نص لا تُعرض إلا برابط صالح يُفتح. ملف نقي (يستعمله /api/chat والاختبارات).
 */

/** رابط صالح يُفتح: http أو https بنطاق فيه نقطة. */
export function validUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".");
  } catch {
    return false;
  }
}

/** المقتطف المعروض: "" إن كان فارغاً أو بقايا كود. */
export function fatwaExcerpt(excerpt: string | undefined): string {
  const t = (excerpt ?? "").trim();
  return t && !looksLikeCode(t) ? t : "";
}

/** تُعرض الفتوى إن كان لها نص سليم، أو رابط صالح على الأقل. */
export function showFatwaCard(f: { excerpt?: string; url?: string }): boolean {
  return Boolean(fatwaExcerpt(f.excerpt)) || validUrl(f.url);
}
