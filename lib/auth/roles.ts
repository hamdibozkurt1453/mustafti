import "server-only";

import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { adminNeedsMfa, isAdminRole, isDemoNoMfaEmail, roleSatisfies, type AdminRole, type Role } from "./role-rules";

// الأدوار وقواعدها النقية في role-rules.ts (تُختبر محلياً)، وتُصدَّر من هنا كما كانت.
export { ADMIN_ROLES, adminNeedsMfa, isAdminRole, isDemoNoMfaEmail, roleSatisfies, type AdminRole, type Role } from "./role-rules";

export type AuthContext = {
  userId: string | null;
  email: string | null;
  /** الدور الفعلي بعد شرط MFA للمشرفين. */
  role: Role;
  /** دور المشرف المسجّل في الجدول، حتى قبل MFA (لشاشة MFA فقط). */
  adminRole: AdminRole | null;
  expertStatus: "pending" | "approved" | "rejected" | null;
  /** مستوى التحقق في الجلسة: aal2 بعد MFA. */
  aal: "aal1" | "aal2" | null;
  /** مشرف تجريبي بلا MFA (بريده في DEMO_NO_MFA_EMAILS). false لكل من سواه. */
  demo: boolean;
};

const VISITOR: AuthContext = {
  userId: null,
  email: null,
  role: "visitor",
  adminRole: null,
  expertStatus: null,
  aal: null,
  demo: false,
};

/**
 * يقرأ هوية الطلب الحالي مرة واحدة لكل طلب (cache).
 * الجلسة تُتحقق بتوقيعها (getClaims)، والأدوار تُقرأ من القاعدة بجلسة المستخدم
 * (سياسات RLS تسمح لكل حساب بقراءة صفّه في admins وexperts).
 */
export const getAuthContext = cache(async (): Promise<AuthContext> => {
  // الصفحة التي تفحص الهوية تُرسم لكل طلب، لا تُبنى ثابتة (حتى قبل إعداد Supabase).
  await connection();
  if (!isSupabaseConfigured()) return VISITOR;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return VISITOR;

  const userId = claims.sub;
  const aal = claims.aal === "aal2" ? "aal2" : "aal1";

  const [{ data: admin }, { data: expert }] = await Promise.all([
    supabase.from("admins").select("role").eq("id", userId).maybeSingle(),
    supabase.from("experts").select("status").eq("id", userId).maybeSingle(),
  ]);

  const adminRole = isAdminRole(admin?.role) ? admin.role : null;
  const expertStatus = (expert?.status as AuthContext["expertStatus"]) ?? null;

  const email = typeof claims.email === "string" ? claims.email : null;
  // الحساب التجريبي: مشرف في الجدول + بريد الجلسة (من JWT الموقّع) في DEMO_NO_MFA_EMAILS.
  const demo = Boolean(adminRole) && isDemoNoMfaEmail(email, process.env.DEMO_NO_MFA_EMAILS);

  let role: Role = "user";
  if (adminRole && (aal === "aal2" || !adminNeedsMfa(adminRole, demo))) role = adminRole;
  else if (expertStatus === "approved") role = "expert";

  return {
    userId,
    email,
    role,
    adminRole,
    expertStatus,
    aal,
    demo,
  };
});

/** الدور الفعلي للطلب الحالي. */
export async function getRole(): Promise<Role> {
  return (await getAuthContext()).role;
}

/** يُرمى حين لا يملك الطلب الدور المطلوب. status: 401 بلا دخول، 403 بدور غير كافٍ. */
export class AuthzError extends Error {
  constructor(public readonly status: 401 | 403) {
    super(status === 401 ? "Unauthorized" : "Forbidden");
    this.name = "AuthzError";
  }
}

/**
 * يُستعمل في أول كل مسار خادم (صفحة، API، Server Action):
 *   const ctx = await requireRole(["super_admin", "reviewer"]);
 * يرمي AuthzError (للـ API: حوّلها بـ authzResponse)، أو مع { notFound: true }
 * يعيد 404 (للصفحات السرية مثل لوحة المشرف، حتى لا يُعرف وجودها).
 */
export async function requireRole(
  roles: readonly Role[],
  options: { notFound?: boolean } = {},
): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (roleSatisfies(ctx.role, roles)) return ctx;
  if (options.notFound) notFound();
  throw new AuthzError(ctx.role === "visitor" ? 401 : 403);
}

/** يحوّل AuthzError إلى رد JSON في مسارات API، ويعيد null لغيره. */
export function authzResponse(error: unknown): Response | null {
  if (!(error instanceof AuthzError)) return null;
  return Response.json({ error: error.message }, { status: error.status });
}
