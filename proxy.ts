import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { updateSession } from "./lib/supabase/middleware";

const intl = createMiddleware(routing);

/**
 * 1) يوجّه كل زائر إلى مسار لغته (/ar افتراضياً).
 * 2) يجدد جلسة Supabase على الرد نفسه (lib/supabase/middleware.ts).
 */
export default async function proxy(request: NextRequest) {
  const response = intl(request);
  return updateSession(request, response);
}

export const config = {
  // كل المسارات ما عدا الواجهات البرمجية وملفات Next والملفات الثابتة.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
