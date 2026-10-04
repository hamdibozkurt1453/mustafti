"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

/**
 * عميل المتصفح: بالمفتاح العام فقط، ويخضع لسياسات RLS بجلسة المستخدم.
 * يُستعمل في المكوّنات العميلة (مثل شاشة MFA).
 */
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
