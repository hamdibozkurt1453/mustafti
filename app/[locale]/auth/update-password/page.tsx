import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { UpdatePasswordForm } from "@/components/auth/ResetForms";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/locales";
import { getAuthContext } from "@/lib/auth/roles";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "auth" });
  return { title: t("updateTitle"), robots: { index: false } };
}

/**
 * `/auth/update-password` — بعد الضغط على رابط إعادة التعيين (F1): /api/auth/callback يفتح الجلسة ثم يحوّل هنا.
 * بلا جلسة (رابط منتهٍ أو فتح الصفحة مباشرة): رسالة ورابط لطلب رابط جديد.
 */
export default async function UpdatePasswordPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout
  const t = await getTranslations("auth");
  const { userId } = await getAuthContext();
  return (
    <AuthShell title={t("updateTitle")} lead={userId ? t("updateLead") : undefined}>
      {userId ? (
        <UpdatePasswordForm />
      ) : (
        <div className="space-y-4">
          <p role="alert" className="rounded-xl border border-alert-600/30 bg-alert-600/5 px-4 py-3 text-sm text-alert-600">
            {t("errors.link")}
          </p>
          <Link href="/auth/reset" className="inline-block font-semibold text-green-600 underline underline-offset-4">
            {t("forgot")}
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
