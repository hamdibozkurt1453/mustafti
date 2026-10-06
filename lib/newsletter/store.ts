import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/** F3: قراءات النشرة للوحة المشرف (بمفتاح الخادم، بعد requireRole(["super_admin"]) في الصفحة أو المسار). */

export type SubscriberRow = { email: string; lang: string; confirmed: boolean; created_at: string };

export async function newsletterSubscribers(limit = 200): Promise<{ total: number; rows: SubscriberRow[]; ready: boolean }> {
  const { data, count, error } = await createAdminClient()
    .from("newsletter_subscribers")
    .select("email, lang, confirmed, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<SubscriberRow[]>();
  if (error) {
    console.error("newsletter subscribers:", error.message);
    return { total: 0, rows: [], ready: false };
  }
  return { total: count ?? data?.length ?? 0, rows: data ?? [], ready: true };
}

/** كل المشتركين للتصدير (على دفعات من 1000، حد PostgREST الافتراضي). */
export async function allSubscribers(): Promise<SubscriberRow[]> {
  const db = createAdminClient();
  const out: SubscriberRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("newsletter_subscribers")
      .select("email, lang, confirmed, created_at")
      .order("created_at", { ascending: true })
      .range(from, from + 999)
      .returns<SubscriberRow[]>();
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}
