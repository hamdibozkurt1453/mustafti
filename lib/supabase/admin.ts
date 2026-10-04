import "server-only";

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./env";

/**
 * عميل الخادم بمفتاح service role: يتجاوز RLS، فلا يُستعمل إلا بعد requireRole()
 * أو لمهام الخادم الداخلية (حد الطلبات، فتح الملف بالرمز السري، المشرف الأول).
 *
 * `import "server-only"` يجعل البناء يفشل إن استُورد هذا الملف في مكوّن عميل،
 * فلا يصل المفتاح السري إلى المتصفح أبداً.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) {
    throw new Error("Supabase service role is not configured (SUPABASE_SERVICE_ROLE_KEY).");
  }
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function isAdminClientConfigured(): boolean {
  return Boolean(SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
