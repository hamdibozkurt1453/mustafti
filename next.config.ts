import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { locales } from "./i18n/locales";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** بادئة اللغة في قواعد التحويل: (ar|en|…). */
const L = `:locale(${locales.join("|")})`;

const nextConfig: NextConfig = {
  // R2: المواقيت والأذكار بطاقتان في الرئيسية، و«ملفي الشخصي» تبويب في /me.
  async redirects() {
    return [
      { source: `/${L}/prayer`, destination: "/:locale#prayer", permanent: false },
      { source: `/${L}/adhkar`, destination: "/:locale#adhkar", permanent: false },
      { source: `/${L}/expert/profile`, destination: "/:locale/me", permanent: false },
    ];
  },
};

export default withNextIntl(nextConfig);
