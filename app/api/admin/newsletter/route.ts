import { authzResponse, requireRole } from "@/lib/auth/roles";
import { subscribersCsv } from "@/lib/newsletter/rules";
import { allSubscribers } from "@/lib/newsletter/store";

/**
 * GET /api/admin/newsletter — تصدير مشتركي النشرة CSV (F3). للمشرف الأعلى وحده بعد MFA
 * (requireRole يفحص الدور الفعلي بعد aal2 لكل طلب)، ولا يُخزَّن الملف في أي ذاكرة وسيطة.
 */
export async function GET() {
  try {
    await requireRole(["super_admin"]);
    const csv = subscribersCsv(await allSubscribers());
    const date = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="mustafti-newsletter-${date}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const res = authzResponse(error);
    if (res) return res;
    console.error("newsletter export:", error instanceof Error ? error.message : error);
    return Response.json({ error: "generic" }, { status: 500 });
  }
}
