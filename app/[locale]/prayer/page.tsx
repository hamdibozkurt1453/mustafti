import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { PrayerTimesView } from "@/components/prayer/PrayerTimesView";
import { getAuthContext } from "@/lib/auth/roles";
import { cityById } from "@/lib/prayer/cities";
import { decodeMethod, DEFAULT_SETTINGS, type PrayerSettings } from "@/lib/prayer/times";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "pages.prayer" });
  return { title: t("title"), description: t("description") };
}

/** اختيار المستخدم المسجّل من profiles (city وcalc_method)، أو null. */
async function profileSettings(userId: string | null): Promise<PrayerSettings | null> {
  if (!userId) return null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("profiles").select("city, calc_method").eq("id", userId).maybeSingle();
    const decoded = decodeMethod(data?.calc_method);
    const city = cityById(data?.city);
    if (!decoded && !city) return null;
    return {
      place: city ? { kind: "city", cityId: city.id } : DEFAULT_SETTINGS.place,
      method: decoded?.method ?? DEFAULT_SETTINGS.method,
      madhab: decoded?.madhab ?? DEFAULT_SETTINGS.madhab,
    };
  } catch {
    return null;
  }
}

/** `/prayer` — المواقيت (S6): تُحسب في المتصفح، ولا يصل الموقع إلى الخادم. */
export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout
  const t = await getTranslations("pages.prayer");
  const ctx = await getAuthContext();
  const initial = await profileSettings(ctx.userId);
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:py-14">
      <h1 className="text-[28px] font-bold leading-snug sm:text-[40px]">{t("title")}</h1>
      <p className="mt-3 text-ink-600 sm:text-[17px]">{t("description")}</p>
      <PrayerTimesView initial={initial} signedIn={Boolean(ctx.userId)} />
    </main>
  );
}
