import { checkRateLimit } from "@/lib/rate-limit";
import { handleSubscribe, NEWSLETTER_LIMIT_PER_HOUR, OUTCOME_STATUS } from "@/lib/newsletter/rules";
import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";

/**
 * POST /api/newsletter — الاشتراك في النشرة (F3، حقل التذييل).
 * التحقق من صيغة البريد، وحقل فخ للبوتات، وحد 5 محاولات في الساعة لكل IP (rate_limits)،
 * ثم الإدراج في newsletter_subscribers بمفتاح الخادم (لا قراءة ولا كتابة للعموم في RLS).
 * الرد لا يكشف شيئاً عن المشتركين إلا «مشترك من قبل» لصاحب البريد نفسه.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const outcome = await handleSubscribe(body, {
    limit: async () => (await checkRateLimit("newsletter", request.headers, NEWSLETTER_LIMIT_PER_HOUR, 3600)).ok,
    insert: async (row) => {
      if (!isAdminClientConfigured()) return "error";
      const { error } = await createAdminClient().from("newsletter_subscribers").insert(row);
      if (!error) return "ok";
      if (error.code === "23505") return "duplicate";
      console.error("newsletter:", error.message);
      return "error";
    },
  });
  return Response.json({ outcome }, { status: OUTCOME_STATUS[outcome] });
}
