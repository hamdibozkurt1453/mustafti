import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/locales";

type IntroKey = "forum";

/**
 * صفحة تعريف قصيرة لائقة (R2) لقسم يُبنى لاحقاً (/forum في R4؛ و/discover صارت محادثة في R3):
 * عنوان، وسطر تعريف، وزر يعود إلى المحادثة. بلا «قيد البناء»، وبلا أي نص ديني.
 */
export async function IntroPage({ page, href }: { page: IntroKey; href: string | { pathname: "/"; query: Record<string, string> } }) {
  const t = await getTranslations(`intro.${page}`);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-12 sm:py-20">
      <section className="mf-stagger relative isolate overflow-hidden rounded-[32px] bg-green-900 px-6 py-12 text-center text-ivory-50 sm:px-12 sm:py-16">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{ background: "radial-gradient(70% 80% at 50% 0%, rgb(10 107 69 / 0.8), transparent 70%), radial-gradient(60% 60% at 50% 110%, rgb(255 184 0 / 0.14), transparent 70%)" }}
        />
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-500">{t("kicker")}</p>
        <h1 className="mt-3 font-display text-[34px] font-semibold leading-tight sm:text-5xl">{t("title")}</h1>
        <p className="mx-auto mt-4 max-w-xl text-ivory-50/80 sm:text-[17px]">{t("lead")}</p>
        <div>
          <Link
            href={href}
            className="mf-press mt-8 inline-flex items-center gap-2 rounded-full bg-gold-500 px-6 py-3 font-semibold text-green-900 hover:brightness-105"
          >
            {t("cta")}
            <span aria-hidden className="rtl:-scale-x-100">→</span>
          </Link>
        </div>
      </section>
    </main>
  );
}

export async function introMetadata(locale: string, page: IntroKey) {
  const t = await getTranslations({ locale: locale as Locale, namespace: `intro.${page}` });
  return { title: t("title"), description: t("lead") };
}
