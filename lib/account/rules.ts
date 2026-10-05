import { locales } from "@/i18n/locales";

/**
 * قواعد صفحة «حسابي» (R2) الصرفة، للاختبار: تبويبات /me، والتحقق من الملف، وعبارة تأكيد الحذف.
 */

export const ME_TABS = ["profile", "cases", "forum", "public", "settings"] as const;
export type MeTab = (typeof ME_TABS)[number];

/** التبويب المطلوب (?tab=)، و«ملفي العام» للمختص المقبول فقط؛ وإلا «الملف». */
export function resolveTab(raw: unknown, isExpert: boolean): MeTab {
  const tab = (ME_TABS as readonly string[]).includes(String(raw)) ? (raw as MeTab) : "profile";
  return tab === "public" && !isExpert ? "profile" : tab;
}

export const NAME_MAX = 80;

/** الاسم واللغة المفضّلة بعد التنظيف، أو null إن لم يصلحا. الاسم الفارغ يُحفظ null. */
export function parseAccountInput(input: unknown): { displayName: string | null; preferredLang: string } | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (typeof o.displayName !== "string" || typeof o.preferredLang !== "string") return null;
  const name = o.displayName.replace(/\s+/g, " ").trim();
  if (name.length > NAME_MAX) return null;
  if (!(locales as readonly string[]).includes(o.preferredLang)) return null;
  return { displayName: name || null, preferredLang: o.preferredLang };
}

/** عبارة التأكيد الثاني للحذف: يكتبها المستخدم بحروفها (بلا فرق في المسافات وحالة الأحرف). */
export function deleteConfirmed(typed: unknown, phrase: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  return typeof typed === "string" && norm(typed) !== "" && norm(typed) === norm(phrase);
}

/** اسم ملف «تنزيل بياناتي». */
export function exportFileName(date: Date): string {
  return `mustafti-data-${date.toISOString().slice(0, 10)}.json`;
}
