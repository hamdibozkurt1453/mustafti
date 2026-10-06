/**
 * دخول تجريبي للجنة التحكيم — **للعرض فقط، ويُحذف بعد المسابقة** (F5).
 * يعمل فقط إن كان DEMO_LOGIN=true ووُجدت كلمة المرور في DEMO_ACCOUNTS_PASSWORD (متغيرا بيئة،
 * لا كلمة مرور في الكود). دونهما لا تظهر الأزرار ويرفض المسار كل طلب.
 */

export const DEMO_ACCOUNTS = {
  user: "user@mustafti.com",
  specialized: "specialized@mustafti.com",
  admin: "admin@mustafti.com",
} as const;

export type DemoRole = keyof typeof DEMO_ACCOUNTS;

type Env = Record<string, string | undefined>;

/** هل الدخول التجريبي مفعّل؟ */
export function demoLoginEnabled(env: Env = process.env): boolean {
  return env.DEMO_LOGIN === "true" && Boolean(env.DEMO_ACCOUNTS_PASSWORD?.trim());
}

/** الحساب التجريبي للدور المطلوب، أو null إن لم يكن من الثلاثة. */
export function demoEmail(role: unknown): string | null {
  return typeof role === "string" && Object.hasOwn(DEMO_ACCOUNTS, role) ? DEMO_ACCOUNTS[role as DemoRole] : null;
}
