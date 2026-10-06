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

/**
 * F1: ترتيب أقسام تبويب «الملف» عند الجميع: «بياناتي» ثم «الصورة والنبذة».
 * F2: حُذف قسم «المدينة وطريقة حساب المواقيت» (الموقع والطريقة آليان في بطاقة المواقيت).
 * للمختص المقبول قسمه الكامل (الصورة والنبذة والبلد والتواصل في experts)، ولغيره صورة ونبذة في profiles.
 */
export type ProfileSection = "account" | "expertCard" | "userCard";
export function profileSections(isApprovedExpert: boolean): ProfileSection[] {
  return ["account", isApprovedExpert ? "expertCard" : "userCard"];
}

export const BIO_MAX = 300;

/** صورة الحساب (مسار في مجلد صاحبها بالمخزن العام) ونبذته، أو null إن لم يصلحا. الفارغ يُحفظ null. */
export function parseProfileCardInput(input: unknown, userId: string): { avatarPath: string | null; bio: string | null } | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const path = o.avatarPath ?? null;
  if (path !== null && (typeof path !== "string" || !new RegExp(`^${userId}/avatar-[a-z0-9]{6,32}\\.(jpg|png|webp)$`).test(path))) return null;
  if (typeof o.bio !== "string") return null;
  const bio = o.bio.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (bio.length > BIO_MAX) return null;
  return { avatarPath: path, bio: bio || null };
}
