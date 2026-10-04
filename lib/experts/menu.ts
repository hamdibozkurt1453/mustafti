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

export type AccountMenuItem = {
  key: "expertDashboard" | "expertProfile" | "applicationStatus" | "expertApplications";
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
      items.push({ key: "expertDashboard", href: "/expert", count }, { key: "expertProfile", href: "/expert/profile" });
    } else if (ctx.expertStatus === "pending" || ctx.expertStatus === "rejected") {
      items.push({ key: "applicationStatus", href: "/experts/join" });
    }

    // المراجعون: الدور من جدول admins (قبل MFA أيضاً، فالعدد وحده لا يكشف شيئاً)، واللوحة نفسها تشترط MFA.
    const adminPath = process.env.ADMIN_PATH;
    if (adminPath && (ctx.adminRole === "super_admin" || ctx.adminRole === "reviewer")) {
      items.push({
        key: "expertApplications",
        href: `/${encodeURIComponent(adminPath)}?tab=experts`,
        count: await pendingApplicationsCount(),
      });
    }
  } catch (error) {
    console.error("account menu:", error instanceof Error ? error.message : error);
  }

  return { signedIn: true, items, total: items.reduce((n, i) => n + (i.count ?? 0), 0) };
}
