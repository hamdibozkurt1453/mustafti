"use server";

import { getAuthContext } from "@/lib/auth/roles";
import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";
import { availableCasesCount, pendingApplicationsCount } from "./store";
import type { ExpertRole } from "./types";

/**
 * قائمة «حسابي» وإشعاراتها داخل الموقع (بلا بريد ولا خدمة جديدة).
 * يستدعيها زر الرأس عند تحميل الصفحة وعند تغيّر المسار، فتبقى الصفحات ثابتة (static)
 * ويُحسب العدّ في الخادم بمفتاح service role بعد قراءة دور الطلب نفسه، ولا يعود إلى المتصفح إلا أعداد وروابط.
 */

/** R2: القائمة «حسابي · لوحة المختص (للمختص) · لوحة المشرف (للمشرف) · خروج»؛ «حسابي» و«خروج» ثابتان في الزر. */
export type AccountMenuItem = {
  key: "expertDashboard" | "adminPanel";
  href: string;
  count?: number;
};

export type AccountMenu = { signedIn: boolean; items: AccountMenuItem[]; total: number };

export async function getAccountMenu(): Promise<AccountMenu> {
  const ctx = await getAuthContext();
  if (!ctx.userId) return { signedIn: false, items: [], total: 0 };
  if (!isAdminClientConfigured()) return { signedIn: true, items: [], total: 0 };

  const items: AccountMenuItem[] = [];
  try {
    if (ctx.expertStatus === "approved") {
      const { data } = await createAdminClient().from("experts").select("role").eq("id", ctx.userId).maybeSingle<{ role: ExpertRole }>();
      const count = data ? await availableCasesCount(data.role) : 0;
      items.push({ key: "expertDashboard", href: "/expert", count });
    }

    // المراجعون: الدور من جدول admins (قبل MFA أيضاً، فالعدد وحده لا يكشف شيئاً)، واللوحة نفسها تشترط MFA.
    const adminPath = process.env.ADMIN_PATH;
    if (adminPath && (ctx.adminRole === "super_admin" || ctx.adminRole === "reviewer")) {
      // المراجعون: «لوحة المشرف» تفتح على طلبات المختصين، بعدد الطلبات المنتظرة.
      items.push({
        key: "adminPanel",
        href: `/${encodeURIComponent(adminPath)}?tab=experts`,
        count: await pendingApplicationsCount(),
      });
    } else if (adminPath && (ctx.adminRole === "moderator" || ctx.adminRole === "viewer")) {
      // المتابع وحساب الاطلاع: رابط اللوحة بلا عدّ.
      items.push({ key: "adminPanel", href: `/${encodeURIComponent(adminPath)}` });
    }
  } catch (error) {
    console.error("account menu:", error instanceof Error ? error.message : error);
  }

  return { signedIn: true, items, total: items.reduce((n, i) => n + (i.count ?? 0), 0) };
}
