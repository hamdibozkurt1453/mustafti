import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/locales";
import { FEATURE_EXTRAS } from "@/lib/config";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "pages.newMuslim" });
  return { title: t("title"), description: t("description") };
}

/**
 * `/new-muslim` — رفيق المسلم الجديد. الرفيق الكامل في S11؛ وحتى ذلك صفحة مختصرة (بلا «قيد البناء»)
 * زرها يفتح المحادثة بمسار المسلم الجديد (/?as=newMuslim). لا نص ديني هنا: الأجوبة من المحادثة ومصادرها.
 */
export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout
  if (!FEATURE_EXTRAS) notFound();
  const t = await getTranslations("newMuslim");
  const tp = await getTranslations("pages.newMuslim");
  const points = ["private", "sources", "expert"] as const;
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
      <section className="relative isolate overflow-hidden rounded-[28px] bg-green-900 p-6 text-ivory-50 sm:p-10">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{ background: "radial-gradient(60% 80% at 85% 20%, rgb(255 184 0 / 0.14), transparent 70%)" }}
        />
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-500">{t("kicker")}</p>
        <h1 className="mt-3 font-display text-[30px] font-bold leading-snug sm:text-[42px]">{tp("title")}</h1>
        <p className="mt-4 text-ivory-50/85 sm:text-[17px]">{t("lead")}</p>
        <Link
          href={{ pathname: "/", query: { as: "newMuslim" } }}
          className="mf-press mt-8 inline-block rounded-full bg-gold-500 px-6 py-3 font-semibold text-green-900 transition hover:brightness-105"
        >
          {t("cta")}
        </Link>
      </section>

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
    </main>
  );
}
