import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminCases } from "@/components/admin/AdminCases";
import { AdminStats } from "@/components/admin/AdminStats";
import { MfaGate } from "@/components/admin/MfaGate";
import { CountBadge } from "@/components/AccountButton";
import { AdminForum } from "@/components/admin/AdminForum";
import { ExpertApplications } from "@/components/admin/ExpertApplications";
import { AuthShell } from "@/components/auth/AuthShell";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/locales";
import { tabsFor, type AdminTab } from "@/lib/admin/rules";
import { ADMIN_ROLES, adminNeedsMfa, getAuthContext, requireRole } from "@/lib/auth/roles";
import { pendingApplicationsCount } from "@/lib/experts/store";
import { openReportsCount } from "@/lib/forum/store";

type Props = {
  params: Promise<{ locale: string; adminPath: string }>;
  searchParams: Promise<{ tab?: string; status?: string; app?: string; track?: string }>;
};

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * `/[ADMIN_PATH]` — لوحة المشرف. التبويبات حسب الدور (lib/admin/rules: tabsFor):
 *   «طلبات المختصين» (S9) لـ super_admin وreviewer، و«الملفات» (S10) لـ super_admin وmoderator،
 *   و«الحوار» (R4) لـ super_admin وmoderator، و«الإحصاءات» (S10) للجميع. وviewer (حساب اطلاع للجنة التحكيم) يرى الكل بلا أزرار ولا وثائق ولا تواصل.
 * طبقات الحماية، كلها في الخادم ولكل طلب:
 *   1) المسار يطابق متغير ADMIN_PATH، وإلا 404.
 *   2) الحساب مسجّل وله صف في جدول admins، وإلا 404 (لا يُكشف وجود اللوحة).
 *   3) الجلسة اجتازت MFA (aal2)، وإلا شاشة التحقق بخطوتين (إلا viewer: للاطلاع فقط، وكل فعل يرفضه الخادم؛
 *      وإلا حساب تجريبي بريده في DEMO_NO_MFA_EMAILS، بشريط «حساب تجريبي»).
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

  if (ctx.aal !== "aal2" && adminNeedsMfa(ctx.adminRole, ctx.demo)) {
    return (
      <AuthShell title={t("admin.mfaTitle")}>
        <MfaGate />
      </AuthShell>
    );
  }

  const admin = await requireRole(ADMIN_ROLES, { notFound: true });
  const role = admin.adminRole!;
  const readOnly = role === "viewer";
  const sp = await searchParams;
  const base = `/${adminPath}`;
  // التبويب لا يُرسم إلا لأدواره (الدور من requireRole بعد MFA)، وكل فعل يفحص الدور ثانية في الخادم.
  const allowed = tabsFor(role);
  const tab: AdminTab = allowed.includes(sp.tab as AdminTab) ? (sp.tab as AdminTab) : "home";
  const labels: Record<AdminTab, string> = {
    home: t("experts.review.tabHome"),
    experts: t("experts.review.tab"),
    cases: t("admin.cases.tab"),
    forum: t("admin.forum.tab"),
    stats: t("admin.stats.tab"),
  };
  const tabs = await Promise.all(
    allowed.map(async (key) => ({
      key,
      href: key === "home" ? base : `${base}?tab=${key}`,
      label: labels[key],
      count: key === "experts" ? await pendingApplicationsCount() : key === "forum" ? await openReportsCount() : 0,
    })),
  );

  return (
    <main className="relative flex flex-1 justify-center px-4 py-10 sm:py-16">
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-56 bg-green-900" />
      <div className="w-full max-w-4xl rounded-[var(--radius-mf)] border border-sand-200 bg-ivory-50 p-6 shadow-[0_24px_60px_-30px_rgb(4_48_31/0.45)] sm:p-8">
        {admin.demo && (
          <p role="status" className="mb-3 inline-block rounded-full bg-gold-500 px-3 py-1 text-xs font-bold text-green-900">
            {t("admin.demoBanner")}
          </p>
        )}
        {readOnly && (
          <p role="status" className="mb-5 rounded-xl bg-gold-500 px-4 py-2.5 text-center text-sm font-bold text-green-900">
            {t("admin.viewerBanner")}
          </p>
        )}
        <h1 className="font-display text-[28px] font-bold leading-snug text-green-900 sm:text-[32px]">{t("pages.admin.title")}</h1>
        <p className="mt-2 text-green-900">
          <span className="text-ink-600">{t("admin.roleLabel")}: </span>
          <strong>{t(`auth.roles.${role}`)}</strong>
        </p>
        <nav className="mt-5 flex flex-wrap gap-2 border-b border-sand-200 pb-3">
          {tabs.map((x) => (
            <Link
              key={x.key}
              href={x.href}
              aria-current={x.key === tab ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold ${
                x.key === tab ? "bg-green-900 text-ivory-50" : "text-green-900 hover:bg-green-900/5"
              }`}
            >
              {x.label}
              <CountBadge
                count={x.count}
                label={x.key === "forum" ? t("admin.forum.reportsCount", { count: x.count }) : t("experts.review.pendingBadge", { count: x.count })}
              />
            </Link>
          ))}
        </nav>
        <div className="mt-6">
          {tab === "experts" ? (
            <ExpertApplications base={base} status={sp.status} selected={sp.app} readOnly={readOnly} />
          ) : tab === "cases" ? (
            <AdminCases base={base} status={sp.status} track={sp.track} canAct={!readOnly} />
          ) : tab === "forum" ? (
            <AdminForum canAct={!readOnly} />
          ) : tab === "stats" ? (
            <AdminStats />
          ) : (
            <p className="text-ink-600">{t(readOnly ? "admin.viewerLead" : "admin.dashboardLead")}</p>
          )}
        </div>
      </div>
    </main>
  );
}
