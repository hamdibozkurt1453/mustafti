import { cached } from "@/lib/cache";
import { getAuthContext } from "@/lib/auth/roles";
import { getDailyUsage, llmHealth, llmModel } from "@/lib/llm";
import { mcpHealth } from "@/lib/mcp";
import { allSourcesHealth, debugSiteSearch, SOURCES } from "@/lib/sources";
import { checkBayyinat } from "@/lib/sources/bayyinat";
import { mcpQuranSamples } from "@/lib/sources/mcp-search";
import { renderHealthPage, type HealthReport } from "./render";

/**
 * GET /api/health — حالة المنصة، تعمل من Vercel نفسه:
 *   - النموذج: المفتاح صالح والنموذج متاح (بلا توليد، فلا تستهلك رصيداً)، واستهلاك اليوم.
 *   - خادم MCP: الاتصال وقائمة أدواته.
 *   - كل مصدر في المرجعية: يعمل / لا يعمل / محجوب، بطرق وصوله.
 *   - ملف «بيّنات»: هل يمكن فهرسته محلياً (robots.txt، ونوع الملف وحجمه، بلا تنزيل).
 * الافتراضي صفحة HTML بجدول واضح، و?format=json للآلات، و?debug=1 لتشخيص صفحات البحث.
 * النتيجة تُخزَّن 5 دقائق حتى لا تُرهق المواقع بالفحص المتكرر.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CACHE_MS = 5 * 60 * 1000;

async function buildReport(): Promise<Omit<HealthReport, "model" | "viewerIsAdmin">> {
  const [llm, usage, mcp, sources, bayyinat] = await Promise.all([
    llmHealth(),
    getDailyUsage(),
    mcpHealth(),
    allSourcesHealth(),
    checkBayyinat(),
  ]);
  return { generatedAt: new Date().toISOString(), llm, usage, mcp, sources, bayyinat };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const report = await cached("health:report", CACHE_MS, buildReport);

  // اسم النموذج لا يظهر إلا للمشرف الأعلى (الخطة 0.5: لا يُذكر للمستخدم).
  const ctx = await getAuthContext();
  const viewerIsAdmin = ctx.role === "super_admin";
  // S13: نص خطأ النموذج الداخلي (قد يذكر اسم المتغير أو المزوّد) للمشرف الأعلى وحده.
  const llm = viewerIsAdmin ? report.llm : { ...report.llm, error: undefined };
  const full: HealthReport = { ...report, llm, viewerIsAdmin, model: viewerIsAdmin ? llmModel() || null : null };

  let debug: HealthReport["debug"];
  let quranSamples: HealthReport["quranSamples"];
  if (params.get("debug") === "1") {
    const ids = SOURCES.filter((s) => report.sources.find((h) => h.id === s.id && !h.blocked && h.methods.every((m) => m.results === 0)))
      .map((s) => s.id);
    const rows = await Promise.all(ids.map(async (id) => ({ id, page: await debugSiteSearch(id) })));
    debug = rows.filter((r) => r.page !== null) as HealthReport["debug"];
    // القرآن عبر MCP بلا نتائج: عيّنة خام من ردود أدواته لفهم الصيغة.
    const quran = report.sources.find((h) => h.id === "quranenc");
    if (quran?.methods.some((m) => m.kind === "mcp" && m.results === 0)) quranSamples = await mcpQuranSamples();
  }

  const ok = report.mcp.ok && report.llm.keyValid !== false;
  if (params.get("format") === "json") {
    return Response.json({ ...full, debug, quranSamples }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  }
  return new Response(renderHealthPage({ ...full, debug, quranSamples }), {
    status: ok ? 200 : 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
