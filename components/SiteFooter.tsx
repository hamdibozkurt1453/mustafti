import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/** التذييل: الروابط، و«انضم كمختص»، وسطر المشاركة في التحدي. */
export function SiteFooter() {
  const t = useTranslations();
  const links = [
    { href: "/about", label: t("nav.about") },
    { href: "/prayer", label: t("nav.prayer") },
    { href: "/adhkar", label: t("nav.adhkar") },
    { href: "/new-muslim", label: t("nav.newMuslim") },
    { href: "/privacy", label: t("footer.privacy") },
    { href: "/eval", label: t("footer.eval") },
  ] as const;

  return (
    <footer className="bg-green-900 text-ivory-50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Image src="/brand/icon-mark.svg" alt="" width={48} height={48} className="h-12 w-12" />
          <div>
            <p className="font-semibold">{t("footer.joinExpert")}</p>
            <p className="mt-1 text-sm text-ivory-50/75">{t("footer.joinExpertHint")}</p>
            <Link
              href="/experts/join"
              className="mt-3 inline-block rounded-full border-2 border-gold-500 px-5 py-2 text-sm font-semibold text-gold-500 transition hover:bg-gold-500 hover:text-green-900"
            >
              {t("footer.joinExpert")}
            </Link>
          </div>
        </div>

        <nav aria-label={t("footer.links")}>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-ivory-50/85 hover:text-gold-500">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-ivory-50/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4 text-xs text-ivory-50/70 sm:flex-row sm:justify-between">
          <p>{t("footer.challenge")}</p>
          <p>
            {t("footer.rights")} ·{" "}
            <a href="https://mustafti.com" className="hover:text-gold-500" dir="ltr">
              mustafti.com
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
