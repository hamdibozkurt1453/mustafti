import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { InfoPage } from "@/components/InfoPage";
import { placeholderMetadata } from "@/components/PagePlaceholder";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return placeholderMetadata(locale, "privacy");
}

/** `/privacy` — سياسة الخصوصية (F1): ما يُجمع وما لا يُجمع، وتنزيل البيانات، وحذف الحساب. */
export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout
  return <InfoPage page="privacy" locale={locale} />;
}
