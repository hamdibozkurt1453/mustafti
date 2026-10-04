import type { Metadata, Viewport } from "next";
import { Readex_Pro, Reem_Kufi } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { DisclosureBar } from "@/components/DisclosureBar";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getDirection } from "@/i18n/locales";
import { routing } from "@/i18n/routing";
import "../globals.css";

const readex = Readex_Pro({
  subsets: ["arabic", "latin"],
  variable: "--font-readex",
  display: "swap",
});

// خط العناوين الفنية فقط (Reem Kufi: كوفي هندسي حديث يناسب الشعار).
const reemKufi = Reem_Kufi({
  subsets: ["arabic", "latin"],
  weight: ["500", "600", "700"],
  variable: "--font-reem",
  display: "swap",
});

const SITE_URL = "https://mustafti.com";

type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: "#04301F",
  width: "device-width",
  initialScale: 1,
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "meta" });

  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t("title"), template: `%s · ${locale === "ar" ? "مُستفتي" : "Mustafti"}` },
    description: t("description"),
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}`])),
    },
    openGraph: {
      type: "website",
      siteName: "Mustafti · مُستفتي",
      title: t("title"),
      description: t("description"),
      url: `/${locale}`,
      locale,
      images: [
        {
          url: "/brand/logo-stacked-on-dark.png",
          width: 1600,
          height: 1100,
          alt: "مُستفتي · Mustafti",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      images: ["/brand/logo-stacked-on-dark.png"],
    },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} dir={getDirection(locale)} className={`${readex.variable} ${reemKufi.variable}`}>
      <body className="flex min-h-dvh flex-col antialiased">
        <NextIntlClientProvider>
          <SiteHeader />
          <DisclosureBar />
          <div className="flex flex-1 flex-col">{children}</div>
          <SiteFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
