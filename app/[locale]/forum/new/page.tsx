import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { NewThreadForm } from "@/components/forum/ForumForms";
import type { Locale } from "@/i18n/locales";
import { getAuthContext } from "@/lib/auth/roles";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "forum.new" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** `/forum/new` — موضوع جديد (R4). للمسجّلين فقط؛ الزائر يُحوَّل إلى الدخول ثم يعود. */
export default async function NewThreadPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout
  const ctx = await getAuthContext();
  if (!ctx.userId) redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/forum/new`)}`);
  const t = await getTranslations("forum");

  return (
    <main className="relative flex-1 px-4 pb-14 pt-8 sm:pt-12">
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-56 bg-green-900" />
      <div className="mx-auto w-full max-w-3xl">
        <header className="mf-stagger text-ivory-50">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-500">{t("title")}</p>
          <h1 className="mt-2 font-display text-[30px] font-semibold leading-tight sm:text-[38px]">{t("new.title")}</h1>
          <p className="mt-2 max-w-2xl text-ivory-50/80">{t("new.lead")}</p>
        </header>
        <section className="mt-8 rounded-[24px] border border-sand-200 bg-ivory-50 p-6 shadow-[0_24px_60px_-30px_rgb(4_48_31/0.45)] sm:p-8">
          <NewThreadForm />
          <p className="mt-6 border-t border-sand-200 pt-4 text-xs text-ink-600">
            <strong className="text-green-900">{t("rulesTitle")}: </strong>
            {t("rules")}
          </p>
        </section>
      </div>
    </main>
  );
}
