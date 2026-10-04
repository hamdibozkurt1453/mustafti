import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MfaGate } from "@/components/admin/MfaGate";
import { AuthShell } from "@/components/auth/AuthShell";
import type { Locale } from "@/i18n/locales";
import { ADMIN_ROLES, getAuthContext, requireRole } from "@/lib/auth/roles";

type Props = { params: Promise<{ locale: string; adminPath: string }> };

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * `/[ADMIN_PATH]` — لوحة المشرف (الأقسام في S10).
 * طبقات الحماية، كلها في الخادم ولكل طلب:
 *   1) المسار يطابق متغير ADMIN_PATH، وإلا 404.
 *   2) الحساب مسجّل وله صف في جدول admins، وإلا 404 (لا يُكشف وجود اللوحة).
 *   3) الجلسة اجتازت MFA (aal2)، وإلا شاشة التحقق بخطوتين.
 *   4) requireRole(ADMIN_ROLES) قبل أي محتوى.
 */
export default async function AdminPage({ params }: Props) {
  const { locale, adminPath } = await params;
  const secret = process.env.ADMIN_PATH;
  if (!secret || decodeURIComponent(adminPath) !== secret) notFound();
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout

  const ctx = await getAuthContext();
  if (!ctx.adminRole) notFound();

  const t = await getTranslations();

  if (ctx.aal !== "aal2") {
    return (
      <AuthShell title={t("admin.mfaTitle")}>
        <MfaGate />
      </AuthShell>
    );
  }

  const admin = await requireRole(ADMIN_ROLES, { notFound: true });
  return (
    <AuthShell title={t("pages.admin.title")} lead={t("admin.dashboardLead")}>
      <p className="text-green-900">
        <span className="text-ink-600">{t("admin.roleLabel")}: </span>
        <strong>{t(`auth.roles.${admin.role}`)}</strong>
      </p>
    </AuthShell>
  );
}
