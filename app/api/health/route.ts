import { cached } from "@/lib/cache";
import { getAuthContext } from "@/lib/auth/roles";
import { getDailyUsage, llmHealth, llmModel } from "@/lib/llm";
import { mcpHealth } from "@/lib/mcp";
import { allSourcesHealth, debugSiteSearch, SOURCES } from "@/lib/sources";
import { renderHealthPage, type HealthReport } from "./render";

/**
 * GET /api/health — حالة المنصة، تعمل من Vercel نفسه:
 *   - النموذج: المفتاح صالح والنموذج متاح (بلا توليد، فلا تستهلك رصيداً)، واستهلاك اليوم.
 *   - خادم MCP: الاتصال وقائمة أدواته.
 *   - كل مصدر في المرجعية: يعمل / لا يعمل / محجوب، بطرق وصوله.
 * الافتراضي صفحة HTML بجدول واضح، و?format=json للآلات، و?debug=1 لتشخيص صفحات البحث.
 * النتيجة تُخزَّن 5 دقائق حتى لا تُرهق المواقع بالفحص المتكرر.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CACHE_MS = 5 * 60 * 1000;

async function buildReport(): Promise<Omit<HealthReport, "model" | "viewerIsAdmin">> {
  const [llm, usage, mcp, sources] = await Promise.all([llmHealth(), getDailyUsage(), mcpHealth(), allSourcesHealth()]);
  return { generatedAt: new Date().toISOString(), llm, usage, mcp, sources };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const report = await cached("health:report", CACHE_MS, buildReport);

  // اسم النموذج لا يظهر إلا للمشرف الأعلى (الخطة 0.5: لا يُذكر للمستخدم).
  const ctx = await getAuthContext();
  const viewerIsAdmin = ctx.role === "super_admin";
  const full: HealthReport = { ...report, viewerIsAdmin, model: viewerIsAdmin ? llmModel() || null : null };

  let debug: HealthReport["debug"];
  if (params.get("debug") === "1") {
    const ids = SOURCES.filter((s) => report.sources.find((h) => h.id === s.id && h.methods.every((m) => m.results === 0)))
      .map((s) => s.id);
    const rows = await Promise.all(ids.map(async (id) => ({ id, page: await debugSiteSearch(id) })));
    debug = rows.filter((r) => r.page !== null) as HealthReport["debug"];
  }

  const ok = report.mcp.ok && report.llm.keyValid !== false;
  if (params.get("format") === "json") {
    return Response.json({ ...full, debug }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  }
  return new Response(renderHealthPage({ ...full, debug }), {
    status: ok ? 200 : 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
