import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { PagePlaceholder, placeholderMetadata } from "@/components/PagePlaceholder";

type Props = { params: Promise<{ locale: string; token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  // رابط الملف سري: لا يُفهرس.
  return { ...(await placeholderMetadata(locale, "case")), robots: { index: false, follow: false } };
}

/** `/case/[رمز]` — متابعة ملف المسألة لصاحب الرابط (S8). */
export default async function CasePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout
  return <PagePlaceholder page="case" />;
}
