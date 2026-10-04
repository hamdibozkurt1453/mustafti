import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthForm } from "@/components/auth/AuthForm";
import { AuthShell } from "@/components/auth/AuthShell";
import { placeholderMetadata } from "@/components/PagePlaceholder";
import type { Locale } from "@/i18n/locales";
import { getAuthContext } from "@/lib/auth/roles";
import { safeNext } from "@/lib/auth/safe-next";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return { ...(await placeholderMetadata(locale, "register")), robots: { index: false } };
}

/** `/register` — إنشاء حساب بالبريد وكلمة المرور. */
export default async function RegisterPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { next } = await searchParams;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout

  const target = next ? safeNext(next, locale) : "";
  if ((await getAuthContext()).userId) redirect(target || `/${locale}/me`);

  const t = await getTranslations("auth");
  return (
    <AuthShell title={t("registerTitle")} lead={t("registerLead")}>
      <AuthForm mode="register" next={target} />
    </AuthShell>
  );
}
