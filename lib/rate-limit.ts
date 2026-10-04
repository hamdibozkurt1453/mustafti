import "server-only";

import { createHmac } from "node:crypto";
import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";

/** حد المحادثة لكل عنوان IP (الخطة، S2): 30 رسالة في الساعة. */
export const CHAT_LIMIT_PER_HOUR = 30;

/** عنوان IP للطلب من ترويسات Vercel. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}

/**
 * يزيد عداد العنوان في جدول rate_limits ويعيد true إن بقي ضمن الحد.
 * يُخزَّن بصمة HMAC للعنوان لا العنوان نفسه (الخصوصية).
 * قبل إعداد Supabase (تطوير محلي) يسمح بالطلب ويكتب تحذيراً.
 */
export async function checkRateLimit(
  scope: string,
  headers: Headers,
  limit: number,
  windowSeconds: number,
): Promise<{ ok: boolean; reason?: "limited" | "unavailable" }> {
  if (!isAdminClientConfigured()) {
    console.warn("rate limit skipped: Supabase is not configured");
    return { ok: true };
  }

  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const key = `${scope}:${createHmac("sha256", secret).update(clientIp(headers)).digest("hex").slice(0, 32)}`;

  const { data, error } = await createAdminClient().rpc("hit_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  // عند تعذّر القاعدة نرفض بأدب بدل أن نفتح الباب بلا حد.
  if (error) {
    console.error("rate limit:", error.message);
    return { ok: false, reason: "unavailable" };
  }
  return data === true ? { ok: true } : { ok: false, reason: "limited" };
}

export function checkChatRateLimit(headers: Headers) {
  return checkRateLimit("chat", headers, CHAT_LIMIT_PER_HOUR, 3600);
}
