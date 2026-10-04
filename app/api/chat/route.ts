import { requireRole, authzResponse } from "@/lib/auth/roles";
import { checkChatRateLimit, CHAT_LIMIT_PER_HOUR } from "@/lib/rate-limit";

/**
 * POST /api/chat — المحادثة (تُربط بالنموذج والمصادر في S5).
 * الآن: فحص الدور (الزائر مسموح) وحد الطلبات لكل IP فقط.
 */
export async function POST(request: Request) {
  try {
    await requireRole(["visitor"]);
  } catch (error) {
    const res = authzResponse(error);
    if (res) return res;
    throw error;
  }

  const limit = await checkChatRateLimit(request.headers);
  if (!limit.ok) {
    return Response.json(
      { error: limit.reason === "limited" ? "rate_limited" : "unavailable", limitPerHour: CHAT_LIMIT_PER_HOUR },
      { status: limit.reason === "limited" ? 429 : 503, headers: { "Retry-After": "3600" } },
    );
  }

  return Response.json({ error: "not_ready" }, { status: 501 });
}
