import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getDirection, type Locale } from "@/i18n/locales";
import { AdhkarView } from "@/components/adhkar/AdhkarView";
import { listAdhkar } from "@/lib/adhkar/store";
import { FEATURE_EXTRAS } from "@/lib/config";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "pages.adhkar" });
  return { title: t("title"), description: t("description") };
}

/** `/adhkar` — الأذكار من موسوعة الأحاديث (جدول adhkar)، بلا أي نص مولّد. */
export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout
  if (!FEATURE_EXTRAS) notFound();
  const t = await getTranslations("pages.adhkar");
  const ta = await getTranslations("adhkar");
  const items = await listAdhkar(locale);
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
      <h1 className="text-[28px] font-bold leading-snug sm:text-[40px]">{t("title")}</h1>
      <p className="mt-3 text-ink-600 sm:text-[17px]">{t("description")}</p>
      <p className="mt-2 text-sm text-ink-600">{ta("note")}</p>
      <AdhkarView items={items} rtlMeaning={getDirection(locale) === "rtl"} />
    </main>
  );
}
