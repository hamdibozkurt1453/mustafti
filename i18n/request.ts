import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

type Messages = { [key: string]: string | Messages };

/**
 * يدمج ترجمة اللغة فوق الإنجليزية: كل نص فارغ في ملف لغة لم تُترجم بعد
 * يظهر بالإنجليزية بدل أن يظهر فارغاً.
 */
function withFallback(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const baseValue = base[key];
    if (typeof value === "string") {
      if (value.trim() !== "") out[key] = value;
    } else if (typeof baseValue === "object") {
      out[key] = withFallback(baseValue, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const messages = (await import(`../messages/${locale}.json`)).default;
  if (locale === "ar" || locale === "en") return { locale, messages };

  const english = (await import("../messages/en.json")).default;
  return { locale, messages: withFallback(english, messages) };
});
