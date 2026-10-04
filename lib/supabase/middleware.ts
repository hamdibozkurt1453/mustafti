import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

/**
 * يجدد جلسة Supabase على الرد الذي أعدّه توجيه اللغات (next-intl)،
 * فيبقى التوجيه (/ → /ar) كما هو وتُكتب كوكيز الجلسة المجددة عليه.
 * يُستدعى من proxy.ts لكل صفحة.
 */
export async function updateSession(request: NextRequest, response: NextResponse) {
  if (!isSupabaseConfigured()) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
        // ترويسات منع التخزين المؤقت للرد الذي يحمل جلسة جديدة.
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // يتحقق من التوقيع ويجدد الرمز عند انتهائه. لا تضع منطقاً بينه وبين إنشاء العميل.
  await supabase.auth.getClaims();

  return response;
}
