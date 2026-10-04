import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getDirection } from "@/i18n/locales";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { MobileMenu } from "./MobileMenu";
import { NavLinks } from "./NavLinks";

/** الرأس: الشعار، والروابط (حاسوب) أو ☰ (هاتف)، وزر اللغة، وزر الدخول. */
export async function SiteHeader() {
  const t = await getTranslations("nav");
  const locale = await getLocale();
  // الشعار العربي للغات RTL، والإنجليزي لغيرها.
  const arabicLogo = getDirection(locale) === "rtl";

  return (
    <header className="sticky top-0 z-40 bg-green-900 text-ivory-50">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:gap-4">
        <Link href="/" aria-label={t("homeLink")} className="shrink-0">
          {arabicLogo ? (
            <Image
              src="/brand/logo-ar-on-dark.svg"
              alt="مُستفتي"
              width={3918}
              height={1380}
              priority
              className="h-9 w-auto sm:h-10"
            />
          ) : (
            <Image
              src="/brand/logo-en-on-dark.svg"
              alt="Mustafti"
              width={4338}
              height={910}
              priority
              className="h-6 w-auto sm:h-7"
            />
          )}
        </Link>

        <nav aria-label={t("mainNav")} className="ms-4 hidden lg:block">
          <NavLinks variant="desktop" />
        </nav>

        <div className="ms-auto flex items-center gap-1.5 sm:gap-2">
          <LanguageSwitcher />
          <Link
            href="/login"
            className="rounded-full bg-gold-500 px-4 py-2 text-sm font-semibold text-green-900 transition hover:brightness-105"
          >
            {t("login")}
          </Link>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
