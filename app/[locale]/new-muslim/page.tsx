import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { GuidedChat } from "@/components/chat/GuidedChat";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/locales";
import { FEATURE_EXTRAS } from "@/lib/config";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "guided.newMuslim" });
  return { title: t("title"), description: t("lead") };
}

/**
 * `/new-muslim` — محادثة «المرشد» (R3): واجهة المحادثة نفسها بوضع new_muslim (نبرة ترحيبية بسيطة،
 * ومصادر المبتدئين أولاً، والإحالة إلى مرشد بدور mentor). تحتها ثلاث نقاط عن الخصوصية والمصادر
 * والمختص، وروابط المواقيت والأذكار. لا نص ديني هنا: الأجوبة من المحادثة ومصادرها.
 */
export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout
  if (!FEATURE_EXTRAS) notFound();
  const t = await getTranslations("newMuslim");
  const points = ["private", "sources", "expert"] as const;
  return (
    <GuidedChat mode="new_muslim">
      <ul className="mf-stagger mt-6 grid gap-3 sm:grid-cols-3">
        {points.map((k) => (
          <li key={k} className="mf-lift rounded-2xl border border-sand-200 bg-white p-5">
            <p className="font-semibold text-green-900">{t(`points.${k}.title`)}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-600">{t(`points.${k}.body`)}</p>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-sm text-ink-600">
        {t("more")}{" "}
        <Link href={{ pathname: "/", hash: "prayer" }} className="font-semibold text-green-600 underline underline-offset-4">{t("prayerLink")}</Link>
        {" · "}
        <Link href={{ pathname: "/", hash: "adhkar" }} className="font-semibold text-green-600 underline underline-offset-4">{t("adhkarLink")}</Link>
      </p>
    </GuidedChat>
  );
}
