import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { HomeExperience } from "@/components/home/HomeExperience";

/** `/` — المحادثة هي الصفحة الرئيسية (القسم 1.1). */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout
  return <HomeExperience />;
}
