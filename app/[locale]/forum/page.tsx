import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { IntroPage, introMetadata } from "@/components/IntroPage";
import type { Locale } from "@/i18n/locales";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return introMetadata(locale, "forum");
}

/** `/forum` — الحوار (يُبنى في R4). الآن صفحة تعريف بزر يعود إلى المحادثة. */
export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout
  return <IntroPage page="forum" href={"/"} />;
}
