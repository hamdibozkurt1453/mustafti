import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/** يوجّه كل زائر إلى مسار لغته (/ar افتراضياً). */
export default createMiddleware(routing);

export const config = {
  // كل المسارات ما عدا الواجهات البرمجية وملفات Next والملفات الثابتة.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
