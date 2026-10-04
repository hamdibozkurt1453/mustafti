/**
 * المتغيرات العامة لـ Supabase (تصل إلى المتصفح عمداً: الرابط والمفتاح العام anon).
 * المفتاح العام آمن لأن RLS يحمي كل جدول. المفتاح السري service role ليس هنا أبداً.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** هل أُعدّت Supabase؟ قبل إعدادها يعمل الموقع بلا حسابات بدل أن يتعطل. */
export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL !== "" && SUPABASE_ANON_KEY !== "";
}
