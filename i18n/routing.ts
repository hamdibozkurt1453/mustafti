import { defineRouting } from "next-intl/routing";
import { defaultLocale, ENABLED_LOCALES, type Locale } from "./locales";

export const routing = defineRouting({
  // F4: المفعّلة وحدها (العربية والإنجليزية)؛ مسارات اللغات الأخرى تحوّل إلى /en في next.config.ts.
  // النوع يبقى اللغات الاثنتي عشرة (فلا يتغير شيء في الكود عند إعادة تفعيل لغة).
  locales: [...ENABLED_LOCALES] as Locale[],
  defaultLocale,
  // مسار اللغة دائماً في الرابط: /ar، /en…
  localePrefix: "always",
  // العربية افتراضية للجميع، لا تُستنتج اللغة من المتصفح (docs/decisions.md).
  localeDetection: false,
});
