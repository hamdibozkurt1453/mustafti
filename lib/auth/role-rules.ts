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

/** الأدوار التي تشترط MFA (كل أدوار المشرفين إلا حساب الاطلاع). */
export function adminNeedsMfa(role: AdminRole): boolean {
  return role !== "viewer";
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
