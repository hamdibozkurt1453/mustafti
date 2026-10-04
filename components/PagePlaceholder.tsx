import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/locales";

export type PageKey =
  | "case" | "me" | "prayer" | "adhkar" | "newMuslim" | "about"
  | "privacy" | "eval" | "login" | "expertsJoin" | "expert" | "admin";

/** هيكل صفحة بعنوانها ووصفها، يُملأ في الجلسات اللاحقة. */
export async function PagePlaceholder({ page }: { page: PageKey }) {
  const t = await getTranslations("pages");
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
      <h1 className="text-[28px] font-bold leading-snug sm:text-[40px]">{t(`${page}.title`)}</h1>
      <p className="mt-3 text-ink-600 sm:text-[17px]">{t(`${page}.description`)}</p>
      <div className="mt-8 rounded-2xl border border-dashed border-sand-200 bg-white p-6 text-center text-ink-600">
        <p>{t("underConstruction")}</p>
        <Link href="/" className="mt-3 inline-block font-semibold text-green-600 underline underline-offset-4">
          {t("backHome")}
        </Link>
      </div>
    </main>
  );
}

/** عنوان الصفحة في وسم <title>. */
export async function placeholderMetadata(locale: string, page: PageKey) {
  const t = await getTranslations({ locale: locale as Locale, namespace: "pages" });
  return { title: t(`${page}.title`), description: t(`${page}.description`) };
}
