import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

/**
 * عميل الخادم بجلسة المستخدم (المفتاح العام + كوكيز الجلسة): يخضع لـ RLS.
 * للمكوّنات الخادمية ومسارات API وServer Actions. يُنشأ جديداً لكل طلب.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // المكوّنات الخادمية لا تكتب الكوكيز؛ proxy.ts يجدد الجلسة بدلاً منها.
        }
      },
    },
  });
}
