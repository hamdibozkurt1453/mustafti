import { defineRouting } from "next-intl/routing";
import { defaultLocale, locales } from "./locales";

export const routing = defineRouting({
  locales,
  defaultLocale,
  // مسار اللغة دائماً في الرابط: /ar، /en…
  localePrefix: "always",
  // العربية افتراضية للجميع، لا تُستنتج اللغة من المتصفح (docs/decisions.md).
  localeDetection: false,
});
