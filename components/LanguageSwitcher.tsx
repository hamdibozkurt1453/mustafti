"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { ENABLED_LOCALES, getDirection, localeNames, type Locale } from "@/i18n/locales";
import { ChevronIcon, GlobeIcon } from "./icons";

/** زر اللغة: يبدّل لغة الواجهة ويبقى في الصفحة نفسها. F4: اللغات المفعّلة وحدها (العربية والإنجليزية). */
export function LanguageSwitcher() {
  const t = useTranslations("nav");
  const current = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(locale: Locale) {
    setOpen(false);
    if (locale === current) return;
    startTransition(() => {
      // بلا إعداد pathnames، يعيد usePathname المسار الفعلي بلا بادئة اللغة.
      router.replace(pathname, { locale });
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("language")}
        disabled={pending}
        className="flex h-10 items-center gap-1 rounded-full px-2.5 text-sm text-ivory-50 hover:bg-ivory-50/10 disabled:opacity-60"
      >
        <GlobeIcon className="h-5 w-5" />
        <span className="uppercase sm:hidden">{current}</span>
        <span className="hidden sm:inline">{localeNames[current as Locale]}</span>
        <ChevronIcon className="h-4 w-4 opacity-70" />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t("language")}
          className="absolute end-0 top-12 z-50 max-h-[70vh] w-52 overflow-auto rounded-2xl border border-sand-200 bg-white p-1.5 text-green-900 shadow-xl"
        >
          {ENABLED_LOCALES.map((locale) => (
            <li key={locale} role="option" aria-selected={locale === current}>
              <button
                type="button"
                lang={locale}
                dir={getDirection(locale)}
                onClick={() => choose(locale)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-start text-sm transition ${
                  locale === current ? "bg-green-900 text-ivory-50" : "hover:bg-ivory-50"
                }`}
              >
                <span>{localeNames[locale]}</span>
                <span className="text-xs uppercase opacity-60">{locale}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
