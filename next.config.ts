import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { DISABLED_LOCALES, locales } from "./i18n/locales";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** بادئة اللغة في قواعد التحويل: (ar|en|…). */
const L = `:locale(${locales.join("|")})`;

const nextConfig: NextConfig = {
  // R2: المواقيت بطاقة في الرئيسية، و«ملفي الشخصي» تبويب في /me. (F2: ‎/adhkar عاد صفحة كاملة بالفئات.)
  async redirects() {
    return [
      { source: `/${L}/prayer`, destination: "/:locale#prayer", permanent: false },
      { source: `/${L}/expert/profile`, destination: "/:locale/me", permanent: false },
      // F4: اللغات المعطّلة (غير العربية والإنجليزية) تحوّل إلى الإنجليزية بالمسار نفسه.
      ...(DISABLED_LOCALES.length
        ? [
            { source: `/:off(${DISABLED_LOCALES.join("|")})`, destination: "/en", permanent: false },
            { source: `/:off(${DISABLED_LOCALES.join("|")})/:path*`, destination: "/en/:path*", permanent: false },
          ]
        : []),
    ];
  },
};

export default withNextIntl(nextConfig);
