import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { getDirection } from "@/i18n/locales";
import { AccountButton } from "./AccountButton";
import { HeaderShell } from "./HeaderShell";
import { HomeLink } from "./HomeLink";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { MobileMenu } from "./MobileMenu";
import { NavLinks } from "./NavLinks";

/**
 * الرأس بثلاثة أعمدة (R2): الشعار في البداية، والقائمة في المنتصف تماماً، والدخول واللغة في النهاية.
 * العمودان الجانبيان متساويان (minmax(0,1fr))، فتبقى القائمة في منتصف الصفحة بأي لغة وفي الاتجاهين،
 * و«البداية» و«النهاية» تتبعان dir تلقائياً. تحت xl تحل قائمة ☰ محل الروابط.
 */
export async function SiteHeader() {
  const t = await getTranslations("nav");
  const locale = await getLocale();
  // الشعار العربي للغات RTL، والإنجليزي لغيرها.
  const arabicLogo = getDirection(locale) === "rtl";

  return (
    <HeaderShell>
      <div className="mx-auto grid h-16 max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:gap-6">
        <div className="flex min-w-0 justify-start">
          <HomeLink label={t("homeLink")} className="mf-press shrink-0 rounded-lg">
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
          </HomeLink>
        </div>

        <nav aria-label={t("mainNav")} className="hidden xl:block">
          <NavLinks variant="desktop" />
        </nav>

        <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2">
          <AccountButton />
          <LanguageSwitcher />
          <MobileMenu />
        </div>
      </div>
    </HeaderShell>
  );
}
