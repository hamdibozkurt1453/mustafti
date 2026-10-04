import { useTranslations } from "next-intl";

/** شريط الإفصاح الدائم تحت الرأس (القسم 1.3 من الخطة). */
export function DisclosureBar() {
  const t = useTranslations("disclosure");
  return (
    <div role="note" className="border-b border-sand-200 bg-white">
      <p className="mx-auto flex max-w-6xl items-start gap-2.5 px-4 py-2 text-xs leading-relaxed text-ink-600 sm:items-center sm:text-sm">
        <i aria-hidden className="mt-1.5 inline-block h-2.5 w-2.5 flex-none rounded-full bg-gold-500 sm:mt-0" />
        {t("text")}
      </p>
    </div>
  );
}
