import { authzResponse, requireRole } from "@/lib/auth/roles";
import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";
import { HF_PAGE, hfRowsUrl, ISLAMQA_DATASET, ISLAMQA_LICENSE, parseHfPage } from "@/lib/sources/islamqa-data";

/**
 * /api/admin/import-islamqa — استيراد فتاوى «الإسلام سؤال وجواب» من المجموعة العامة على Hugging Face
 * (kingkaung/islamqainfo_parallel_corpus، CC BY-NC 4.0) إلى جدول islamqa_fatwas (R1d).
 * للمشرف الأعلى فقط (requireRole في الخادم لكل طلب)، و404 لغيره.
 *   GET  ← صفحة بزر «استيراد» وشريط تقدم: تطلب الدفعات (100 صف) واحدة بعد أخرى حتى النهاية،
 *          وتحفظ آخر موضع في المتصفح فتكمل من حيث توقفت.
 *   POST {offset} ← دفعة واحدة من datasets-server، ثم upsert بـ original_id (الجواب حتى 8000 حرف).
 *   POST {action:"status"} ← عدد الصفوف المحفوظة.
 * يتطلب migration supabase/migrations/20261007_islamqa_fatwas.sql.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>استيراد الإسلام سؤال وجواب</title>
<style>body{font-family:"Readex Pro",system-ui,sans-serif;background:#F5F3EA;color:#04301F;max-width:860px;margin:0 auto;padding:16px}button{background:#FFB800;color:#04301F;border:0;border-radius:999px;padding:10px 22px;font:inherit;font-weight:600;cursor:pointer;margin:4px 0}button.alt{background:#fff;border:1px solid #E4DFCF}button[disabled]{opacity:.6}
.bar{height:14px;background:#fff;border:1px solid #E4DFCF;border-radius:999px;overflow:hidden;margin:12px 0}.bar i{display:block;height:100%;width:0;background:#0A6B45;transition:width .3s}#log{font-size:.85rem;white-space:pre-wrap}</style></head>
<body><h1>استيراد «الإسلام سؤال وجواب»</h1>
<p>من المجموعة العامة <a href="https://huggingface.co/datasets/${ISLAMQA_DATASET}" target="_blank" rel="noopener noreferrer">${ISLAMQA_DATASET}</a> (ترخيص ${ISLAMQA_LICENSE}) إلى جدول <code>islamqa_fatwas</code>: العربية والإنجليزية كاملتين (الجواب حتى 8000 حرف)، والعنوان والسؤال والرابط بالتركية والفرنسية والإندونيسية والأردية والبنغالية والروسية. دفعات من ${HF_PAGE} صف، وإعادة الاستيراد آمنة (upsert بالمعرّف). أبقِ الصفحة مفتوحة حتى النهاية؛ إن أُغلقت تكمل من حيث توقفت.</p>
<p>المحفوظ الآن: <b id="count">…</b></p>
<button id="run">استيراد</button> <button id="reset" class="alt">من البداية</button>
<div class="bar"><i id="fill"></i></div><div id="status"></div><div id="log"></div>
<script>
const KEY="mustafti:islamqa-import-offset";
const $=(id)=>document.getElementById(id);
const get=()=>{try{return Number(localStorage.getItem(KEY)||0)}catch{return 0}};
const set=(v)=>{try{localStorage.setItem(KEY,String(v))}catch{}};
async function post(body){const r=await fetch(location.pathname,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
const j=await r.json().catch(()=>({error:"HTTP "+r.status}));if(!r.ok||j.error){const e=new Error(j.error||("HTTP "+r.status));e.retry=j.retry;throw e}return j}
async function status(){try{const j=await post({action:"status"});$("count").textContent=j.count+" فتوى"}catch(e){$("count").textContent="تعذّر: "+e.message}}
let total=null;
function show(o){const pct=total?Math.min(100,Math.round(o/total*100)):0;$("fill").style.width=pct+"%";$("status").textContent="الموضع "+o+(total?" من "+total+" ("+pct+"%)":"")}
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
$("run").onclick=async()=>{$("run").disabled=$("reset").disabled=true;let o=get();show(o);let fails=0;
while(true){try{const j=await post({offset:o});total=j.total??total;o=j.next;set(o);fails=0;show(o);
$("log").textContent="آخر دفعة: "+j.saved+" صفاً"+(j.skipped?" (أُسقط "+j.skipped+" بلا جواب)":"")+" · "+j.ms+"ms";
if(j.done){$("status").textContent="اكتمل الاستيراد ("+o+" صفاً).";break}}
catch(e){fails++;$("log").textContent="تعذّرت الدفعة عند "+o+": "+e.message+(fails<5?" — إعادة بعد "+(fails*5)+" ث":"");
if(fails>=5)break;await sleep(fails*5000)}}
await status();$("run").disabled=$("reset").disabled=false};
$("reset").onclick=()=>{set(0);show(0);$("log").textContent="سيبدأ الاستيراد من أول المجموعة."};
show(get());status();
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
  if (!isAdminClientConfigured()) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, { status: 503 });
  const body = ((await request.json().catch(() => null)) ?? {}) as { offset?: unknown; action?: unknown };
  const db = createAdminClient();
  const noStore = { headers: { "Cache-Control": "no-store" } };

  if (body.action === "status") {
    const { count, error } = await db.from("islamqa_fatwas").select("original_id", { count: "exact", head: true });
    if (error) return Response.json({ error: `islamqa_fatwas: ${error.message} — نفّذ migration 20261007_islamqa_fatwas.sql` }, { status: 500 });
    return Response.json({ count: count ?? 0 }, noStore);
  }

  const offset = Number(body.offset);
  if (!Number.isInteger(offset) || offset < 0 || offset > 1_000_000) return Response.json({ error: "bad offset" }, { status: 400 });
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(hfRowsUrl(offset), {
      headers: { "User-Agent": "mustafti.com (islamqa import)", Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
  } catch (error) {
    return Response.json({ error: `Hugging Face: ${String((error as Error)?.message ?? error).slice(0, 200)}` }, { status: 502 });
  }
  if (!res.ok) return Response.json({ error: `Hugging Face HTTP ${res.status}` }, { status: 502 });
  const page = parseHfPage(await res.json().catch(() => null));
  if (page.rows.length) {
    const { error } = await db.from("islamqa_fatwas").upsert(page.rows, { onConflict: "original_id" });
    if (error) return Response.json({ error: `upsert: ${error.message}` }, { status: 500 });
  }
  const next = offset + page.count;
  const done = page.count === 0 || (page.total !== null && next >= page.total);
  return Response.json(
    { saved: page.rows.length, skipped: page.count - page.rows.length, next, total: page.total, done, ms: Date.now() - t0 },
    noStore,
  );
}
