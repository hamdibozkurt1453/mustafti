import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function LocaleNotFound() {
  const t = useTranslations();
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">{t("notFound.title")}</h1>
      <p className="text-ink-600">{t("notFound.description")}</p>
      <Link href="/" className="font-semibold text-green-600 underline underline-offset-4">
        {t("pages.backHome")}
      </Link>
    </main>
  );
}
