import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { PagePlaceholder, placeholderMetadata } from "@/components/PagePlaceholder";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return placeholderMetadata(locale, "privacy");
}

/** `/privacy` — سياسة الخصوصية. */
export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout
  const t = await getTranslations("pages.privacy");
  return (
    <PagePlaceholder page="privacy">
      <ul className="mt-6 list-inside list-disc space-y-2 text-green-900">
        <li>{t("country")}</li>
      </ul>
    </PagePlaceholder>
  );
}
