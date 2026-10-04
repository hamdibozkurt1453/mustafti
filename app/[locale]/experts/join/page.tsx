import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { ExpertJoinWizard } from "@/components/experts/ExpertJoinWizard";
import { placeholderMetadata } from "@/components/PagePlaceholder";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/locales";
import { getAuthContext } from "@/lib/auth/roles";
import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return placeholderMetadata(locale, "expertsJoin");
}

/**
 * `/experts/join` — التسجيل كمختص بأربع خطوات (S9). يشترط تسجيل الدخول.
 * لكل حساب طلب واحد: إن وُجد تُعرض حالته بدل المعالج (والخادم يرفض الطلب المكرر أيضاً).
 */
export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout

  const ctx = await getAuthContext();
  if (!ctx.userId) redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/experts/join`)}`);

  const t = await getTranslations("experts.join");
  const pages = await getTranslations("pages");
  if (!isAdminClientConfigured()) {
    return <AuthShell title={pages("expertsJoin.title")} lead={t("errors.generic")}>{null}</AuthShell>;
  }

  const db = createAdminClient();
  const [{ data: existing }, { data: profile }] = await Promise.all([
    db.from("experts").select("status, reject_reason").eq("id", ctx.userId).maybeSingle(),
    db.from("profiles").select("display_name").eq("id", ctx.userId).maybeSingle(),
  ]);

  if (existing) {
    if (existing.status === "approved") {
      return (
        <AuthShell title={t("acceptedTitle")} lead={t("acceptedLead")}>
          <Link href="/expert" className="inline-block rounded-full bg-gold-500 px-5 py-3 font-semibold text-green-900">
            {t("enterDashboard")}
          </Link>
        </AuthShell>
      );
    }
    if (existing.status === "rejected") {
      return (
        <AuthShell title={t("rejectedTitle")}>
          {existing.reject_reason && (
            <p className="text-green-900">
              <span className="text-ink-600">{t("rejectReason")}: </span>
              {existing.reject_reason}
            </p>
          )}
        </AuthShell>
      );
    }
    return <AuthShell title={t("doneTitle")} lead={t("doneLead")}>{null}</AuthShell>;
  }

  return (
    <main className="relative flex flex-1 justify-center px-4 py-10 sm:py-16">
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-56 bg-green-900" />
      <div className="w-full max-w-2xl rounded-[var(--radius-mf)] border border-sand-200 bg-ivory-50 p-6 shadow-[0_24px_60px_-30px_rgb(4_48_31/0.45)] sm:p-8">
        <h1 className="font-display text-[28px] font-bold leading-snug text-green-900 sm:text-[32px]">{pages("expertsJoin.title")}</h1>
        <p className="mt-2 text-ink-600">{pages("expertsJoin.description")}</p>
        <div className="mt-6">
          <ExpertJoinWizard userId={ctx.userId} initialName={profile?.display_name ?? ""} />
        </div>
      </div>
    </main>
  );
}
