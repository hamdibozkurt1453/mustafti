import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { IntroPage, introMetadata } from "@/components/IntroPage";
import type { Locale } from "@/i18n/locales";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return introMetadata(locale, "discover");
}

/** `/discover` — تعرّف على الإسلام (يُبنى في R3). الآن صفحة تعريف بزر يفتح المحادثة بأسئلة «لست مسلماً». */
export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout
  return <IntroPage page="discover" href={{ pathname: "/", query: { as: "nonMuslim" } }} />;
}
