import { locales } from "@/i18n/locales";

/**
 * يقبل وجهة التحويل بعد الدخول إن كانت مساراً داخلياً فقط (يمنع التحويل المفتوح
 * إلى مواقع أخرى مثل //evil.com). الافتراضي: /ar/me.
 */
export function safeNext(next: string | null | undefined, locale = "ar"): string {
  const fallback = `/${(locales as readonly string[]).includes(locale) ? locale : "ar"}/me`;
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}
