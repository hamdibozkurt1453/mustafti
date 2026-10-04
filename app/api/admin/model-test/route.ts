import { authzResponse, requireRole } from "@/lib/auth/roles";
import { isLlmConfigured } from "@/lib/llm";
import { runModelTest, toMarkdown } from "@/lib/model-test";

/**
 * /api/admin/model-test — اختبار المقارنة بين النماذج (الخطة 0.4) من Vercel نفسه.
 * للمشرف الأعلى فقط بعد MFA: requireRole(["super_admin"]) لا يتحقق إلا بجلسة aal2.
 *   GET  ← صفحة صغيرة بزر «شغّل الاختبار».
 *   POST ← يشغّل الاختبار (نحو 45 طلباً، بضعة سنتات على الأكثر) ويعيد JSON وتقرير Markdown
 *          جاهزاً للصق في docs/decisions.md.
 * كل الردود لغير المشرف 404، حتى لا يُعرف وجود المسار.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function guard(): Promise<Response | null> {
  try {
    await requireRole(["super_admin"]);
    return null;
  } catch (error) {
    if (authzResponse(error)) return new Response("Not found", { status: 404 });
    throw error;
  }
}

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>اختبار النماذج</title>
<style>body{font-family:"Readex Pro",system-ui,sans-serif;background:#F5F3EA;color:#04301F;max-width:960px;margin:0 auto;padding:16px}button{background:#FFB800;color:#04301F;border:0;border-radius:999px;padding:10px 22px;font:inherit;font-weight:600;cursor:pointer}button[disabled]{opacity:.6}pre{white-space:pre-wrap;background:#fff;border-radius:12px;padding:14px;direction:rtl;unicode-bidi:plaintext}</style></head>
<body><h1>اختبار النماذج المرشحة الأربعة (الخطة 0.4)</h1>
<p>10 أسئلة بخمس لغات: فهم السؤال، وجودة العربية، والالتزام بـ JSON، والسرعة، والتكلفة. يستغرق دقيقة إلى ثلاث دقائق، ويُحسب من الحد اليومي.</p>
<button id="run">شغّل الاختبار</button> <button id="copy" hidden>انسخ التقرير</button>
<pre id="out"></pre>
<script>
const out=document.getElementById("out"),run=document.getElementById("run"),copy=document.getElementById("copy");
run.onclick=async()=>{run.disabled=true;out.textContent="جارٍ الاختبار…";
try{const r=await fetch(location.pathname,{method:"POST"});const j=await r.json();out.textContent=j.markdown||JSON.stringify(j,null,2);copy.hidden=!j.markdown;}
catch(e){out.textContent="تعذّر التشغيل: "+e}finally{run.disabled=false}};
copy.onclick=()=>navigator.clipboard.writeText(out.textContent);
</script></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  // حماية من الطلبات القادمة من مواقع أخرى (CSRF).
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (!isLlmConfigured()) return Response.json({ error: "OPENROUTER_API_KEY is not set" }, { status: 503 });

  const result = await runModelTest();
  return Response.json({ ...result, markdown: toMarkdown(result) }, { headers: { "Cache-Control": "no-store" } });
}
