import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { DISABLED_LOCALES, locales } from "./i18n/locales";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** بادئة اللغة في قواعد التحويل: (ar|en|…). */
const L = `:locale(${locales.join("|")})`;

/**
 * S13: ترويسات أمنية محافظة لكل المسارات. لا CSP الآن (يوتيوب وGoogle Fonts وSupabase وIslamHouse
 * قد تنكسر) — مؤجلة في docs/security.md.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
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
