import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { FEATURE_EXTRAS } from "@/lib/config";
import { PagePlaceholder, placeholderMetadata } from "@/components/PagePlaceholder";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return placeholderMetadata(locale, "prayer");
}

/** `/prayer` — المواقيت (S6). */
export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout
  if (!FEATURE_EXTRAS) notFound(); // مطفأة مؤقتاً (lib/config)
  return <PagePlaceholder page="prayer" />;
}
