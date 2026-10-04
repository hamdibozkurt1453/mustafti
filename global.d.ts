import type { routing } from "@/i18n/routing";
import type messages from "./messages/ar.json";

// مفاتيح الترجمة مضبوطة الأنواع: أي مفتاح غير موجود في ar.json خطأ عند البناء.
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
