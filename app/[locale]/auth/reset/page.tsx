import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetRequestForm } from "@/components/auth/ResetForms";
import type { Locale } from "@/i18n/locales";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "auth" });
  return { title: t("resetTitle"), robots: { index: false } };
}

/** `/auth/reset` — «نسيت كلمة المرور؟» (F1): يرسل رابط إعادة التعيين إلى البريد. التصميم الكامل لاحقاً. */
export default async function ResetPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout
  const t = await getTranslations("auth");
  return (
    <AuthShell title={t("resetTitle")} lead={t("resetLead")}>
      <ResetRequestForm />
    </AuthShell>
  );
}
