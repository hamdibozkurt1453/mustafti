import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { HomeExperience } from "@/components/home/HomeExperience";
import { listAdhkar } from "@/lib/adhkar/store";
import { FEATURE_EXTRAS } from "@/lib/config";

/** الأذكار تتغير نادراً (تُبنى من لوحة المشرف): تُحدَّث الصفحة كل ساعة. */
export const revalidate = 3600;

/** `/` — المحادثة هي الصفحة الرئيسية (القسم 1.1)، وتحتها بطاقة المواقيت بأذكارها الموقوتة (F2b). */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout
  const adhkar = FEATURE_EXTRAS ? await listAdhkar(locale) : [];
  return <HomeExperience adhkar={adhkar} />;
}
