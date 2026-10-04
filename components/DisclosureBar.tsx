"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";

/**
 * شريط الإفصاح الدائم تحت الرأس (القسم 1.3 من الخطة).
 * في الصفحة الرئيسية يظهر داخل الواجهة الأولى وفي المحادثة بدلاً منه.
 */
export function DisclosureBar() {
  const t = useTranslations("disclosure");
  const pathname = usePathname();
  if (pathname === "/") return null;
  return (
    <div role="note" className="border-b border-ivory-50/10 bg-green-900 text-ivory-50/85">
      <p className="mx-auto flex max-w-6xl items-start gap-2.5 px-4 py-2 text-xs leading-relaxed sm:items-center sm:text-[13px]">
        <i aria-hidden className="mt-1.5 inline-block h-2 w-2 flex-none rounded-full bg-gold-500 sm:mt-0" />
        {t("text")}
      </p>
    </div>
  );
}
