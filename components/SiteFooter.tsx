import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getDirection } from "@/i18n/locales";
import { FooterShell } from "./FooterShell";

/** التذييل: عبارة الهوية، والروابط، و«انضم كمختص»، وسطر المشاركة في التحدي. */
export function SiteFooter() {
  const t = useTranslations();
  const arabicLogo = getDirection(useLocale()) === "rtl";

  const columns = [
    {
      title: t("footer.colPlatform"),
      links: [
        { href: "/", label: t("nav.home") },
        { href: "/prayer", label: t("nav.prayer") },
        { href: "/adhkar", label: t("nav.adhkar") },
        { href: "/new-muslim", label: t("nav.newMuslim") },
      ],
    },
    {
      title: t("footer.colProject"),
      links: [
        { href: "/about", label: t("nav.about") },
        { href: "/eval", label: t("footer.eval") },
        { href: "/privacy", label: t("footer.privacy") },
        { href: "/login", label: t("footer.login") },
      ],
    },
  ] as const;

  return (
    <FooterShell>
      <footer className="relative isolate overflow-hidden bg-green-900 text-ivory-50">
        {/* نجمة ثمانية كبيرة خافتة */}
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          className="absolute -bottom-40 -end-40 -z-10 h-[520px] w-[520px] text-gold-500 opacity-[0.07]"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.35"
        >
          <rect x="20.7" y="20.7" width="58.6" height="58.6" />
          <rect x="20.7" y="20.7" width="58.6" height="58.6" transform="rotate(45 50 50)" />
          <circle cx="50" cy="50" r="22" />
          <circle cx="50" cy="50" r="12" />
        </svg>
        <div aria-hidden className="mf-grain pointer-events-none absolute inset-0 -z-10 opacity-[0.06]" />

        <div className="mx-auto max-w-6xl px-4 pb-10 pt-16 sm:pt-24">
          <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <Image
                src={arabicLogo ? "/brand/logo-ar-on-dark.svg" : "/brand/logo-en-on-dark.svg"}
                alt={arabicLogo ? "مُستفتي" : "Mustafti"}
                width={arabicLogo ? 3918 : 4338}
                height={arabicLogo ? 1380 : 910}
                className={arabicLogo ? "h-12 w-auto" : "h-8 w-auto"}
              />
              <p className="mt-6 max-w-lg font-display text-[34px] font-semibold leading-tight sm:text-5xl">
                {t("footer.tagline")}
              </p>
              <p className="mt-4 max-w-md text-sm text-ivory-50/70">{t("disclosure.text")}</p>
            </div>

            <nav aria-label={t("footer.links")} className="grid grid-cols-2 gap-8">
              {columns.map((col) => (
                <div key={col.title}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-500">{col.title}</p>
                  <ul className="mt-4 flex flex-col gap-2.5 text-[15px]">
                    {col.links.map((l) => (
                      <li key={l.href}>
                        <Link href={l.href} className="text-ivory-50/80 transition hover:text-gold-500">
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </div>

          {/* انضم كمختص */}
          <div className="mt-14 flex flex-col gap-5 rounded-[28px] border border-ivory-50/10 bg-ivory-50/[0.04] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <p className="font-display text-2xl font-semibold">{t("footer.joinExpert")}</p>
              <p className="mt-1 max-w-xl text-sm text-ivory-50/70">{t("footer.joinExpertHint")}</p>
            </div>
            <Link
              href="/experts/join"
              className="inline-flex w-fit flex-none items-center gap-2 rounded-full bg-gold-500 px-6 py-3 text-sm font-semibold text-green-900 transition hover:gap-3 hover:brightness-105"
            >
              {t("footer.joinExpert")}
              <span aria-hidden className="rtl:-scale-x-100">→</span>
            </Link>
          </div>

          <div className="mt-12 flex flex-col gap-2 border-t border-ivory-50/10 pt-6 text-xs text-ivory-50/60 sm:flex-row sm:items-center sm:justify-between">
            <p>{t("footer.challenge")}</p>
            <p>
              {t("footer.rights")} ·{" "}
              <a href="https://mustafti.com" className="hover:text-gold-500" dir="ltr">
                mustafti.com
              </a>
            </p>
          </div>
          <p className="mt-2 text-xs text-ivory-50/45">{t("footer.sourceNote")}</p>
        </div>
      </footer>
    </FooterShell>
  );
}
