import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MfaGate } from "@/components/admin/MfaGate";
import { ExpertApplications } from "@/components/admin/ExpertApplications";
import { AuthShell } from "@/components/auth/AuthShell";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/locales";
import { ADMIN_ROLES, getAuthContext, requireRole } from "@/lib/auth/roles";

type Props = {
  params: Promise<{ locale: string; adminPath: string }>;
  searchParams: Promise<{ tab?: string; status?: string; app?: string }>;
};

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * `/[ADMIN_PATH]` — لوحة المشرف. تبويب «طلبات المختصين» (S9) لـ super_admin وreviewer، وبقية الأقسام في S10.
 * طبقات الحماية، كلها في الخادم ولكل طلب:
 *   1) المسار يطابق متغير ADMIN_PATH، وإلا 404.
 *   2) الحساب مسجّل وله صف في جدول admins، وإلا 404 (لا يُكشف وجود اللوحة).
 *   3) الجلسة اجتازت MFA (aal2)، وإلا شاشة التحقق بخطوتين.
 *   4) requireRole(ADMIN_ROLES) قبل أي محتوى.
 */
export default async function AdminPage({ params, searchParams }: Props) {
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
  const sp = await searchParams;
  const base = `/${adminPath}`;
  // التبويب لا يُرسم إلا لـ super_admin وreviewer (الدور من requireRole بعد MFA)، وأفعاله تفحص الدور ثانية.
  const canReview = admin.role === "super_admin" || admin.role === "reviewer";
  const tab = canReview && sp.tab === "experts" ? "experts" : "home";
  const tabs = [
    { key: "home", href: base, label: t("experts.review.tabHome") },
    ...(canReview ? [{ key: "experts", href: `${base}?tab=experts`, label: t("experts.review.tab") }] : []),
  ];

  return (
    <main className="relative flex flex-1 justify-center px-4 py-10 sm:py-16">
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-56 bg-green-900" />
      <div className="w-full max-w-4xl rounded-[var(--radius-mf)] border border-sand-200 bg-ivory-50 p-6 shadow-[0_24px_60px_-30px_rgb(4_48_31/0.45)] sm:p-8">
        <h1 className="font-display text-[28px] font-bold leading-snug text-green-900 sm:text-[32px]">{t("pages.admin.title")}</h1>
        <p className="mt-2 text-green-900">
          <span className="text-ink-600">{t("admin.roleLabel")}: </span>
          <strong>{t(`auth.roles.${admin.role}`)}</strong>
        </p>
        <nav className="mt-5 flex flex-wrap gap-2 border-b border-sand-200 pb-3">
          {tabs.map((x) => (
            <Link
              key={x.key}
              href={x.href}
              aria-current={x.key === tab ? "page" : undefined}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                x.key === tab ? "bg-green-900 text-ivory-50" : "text-green-900 hover:bg-green-900/5"
              }`}
            >
              {x.label}
            </Link>
          ))}
        </nav>
        <div className="mt-6">
          {tab === "experts" ? (
            <ExpertApplications base={base} status={sp.status} selected={sp.app} />
          ) : (
            <p className="text-ink-600">{t("admin.dashboardLead")}</p>
          )}
        </div>
      </div>
    </main>
  );
}
