/**
 * الأدوار وقواعدها النقية (بلا قاعدة ولا Next)، فتُختبر محلياً. الفحص الفعلي في lib/auth/roles.ts.
 */

/**
 * أدوار المشرفين (الخطة، القسم 0.2)، و«viewer» (S10): حساب اطلاع للجنة التحكيم.
 * viewer يدخل اللوحة بلا MFA ويرى للاطلاع فقط: لا يُذكر في أي requireRole لفعل،
 * فكل فعل يرفضه الخادم. والدور يُعطى من جدول admins فقط.
 */
export const ADMIN_ROLES = ["super_admin", "reviewer", "moderator", "viewer"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/**
 * الأدوار التي تشترط MFA: كل أدوار المشرفين إلا حساب الاطلاع، وإلا حساب تجريبي
 * (بريده في DEMO_NO_MFA_EMAILS، يُفحص في الخادم بـ isDemoNoMfaEmail).
 */
export function adminNeedsMfa(role: AdminRole, demo = false): boolean {
  return role !== "viewer" && !demo;
}

/** قائمة بريد مفصولة بفواصل (متغير بيئة) إلى مجموعة بأحرف صغيرة. */
export function parseEmailList(raw: string | null | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes("@")),
  );
}

/**
 * حساب تجريبي بلا MFA (S6): بريد الجلسة الموثّق في قائمة DEMO_NO_MFA_EMAILS، مطابقة تامة.
 * لا أثر له إلا لحساب له صف في جدول admins (الدور من الجدول فقط)، ولا يُطبَّق على غيره أبداً.
 */
export function isDemoNoMfaEmail(email: string | null | undefined, rawList: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  return Boolean(e) && parseEmailList(rawList).has(e);
}

/**
 * الدور الفعلي للطلب الحالي:
 * - visitor: زائر بلا حساب.
 * - user: مستخدم مسجّل.
 * - expert: مختص **مقبول** (المعلّق يبقى user حتى يقبله مشرف).
 * - super_admin / reviewer / moderator: مشرف **اجتاز MFA** في هذه الجلسة.
 * - viewer: حساب اطلاع للجنة التحكيم (بلا MFA، وبلا أي فعل).
 */
export type Role = "visitor" | "user" | "expert" | AdminRole;

export function isAdminRole(role: string | null | undefined): role is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(role ?? "");
}

/**
 * هل يحقق الدور أحد الأدوار المطلوبة؟
 * - "visitor" يعني الجميع.
 * - "user" يعني أي حساب مسجّل (المختص والمشرف مستخدمون أيضاً).
 */
export function roleSatisfies(role: Role, allowed: readonly Role[]): boolean {
  if (allowed.includes("visitor")) return true;
  if (role === "visitor") return false;
  return allowed.includes("user") || allowed.includes(role);
}
