import { authzResponse, requireRole } from "@/lib/auth/roles";
import { BUILD_LANGS, buildArabic, buildTranslation, probe, type CategoryRef } from "@/lib/adhkar/build";
import { arabicRows, saveRows } from "@/lib/adhkar/store";
import { isAdminClientConfigured } from "@/lib/supabase/admin";

/**
 * /api/admin/build-adhkar — بناء الأذكار من موسوعة الأحاديث عبر خادم MCP (S6)، ويحفظها في جدول adhkar.
 * للمشرف الأعلى فقط (requireRole في الخادم لكل طلب)، وكل رد لغيره 404 حتى لا يُعرف وجود المسار.
 *   GET  ← صفحة بزر «ابنِ الأذكار» (العربية أولاً ثم كل لغة واجهة، طلب لكل لغة حتى لا تتجاوز المهلة)،
 *          وزر «فحص» يعرض شجرة الأبواب المتصفَّحة (الرئيسية السبعة ثم الفرعية تكرارياً حتى عمق 3)
 *          ومخطط الأداتين وردودهما الخام.
 *   POST {lang: "ar"} ← يبني العربية ويحفظها (يقرر الإدراج بالدرجة، والوقت والعدد من لفظ الحديث).
 *   POST {lang: "en"…} ← ترجمات الأحاديث المقبولة بالعربية.
 *   POST {probe: true, categoryId?} ← عيّنات خام بلا حفظ.
 * لا يولّد أي نص: كل ما يُحفظ منقول من رد الخادم.
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
  const langs = JSON.stringify(BUILD_LANGS);
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>بناء الأذكار</title>
<style>body{font-family:"Readex Pro",system-ui,sans-serif;background:#F5F3EA;color:#04301F;max-width:960px;margin:0 auto;padding:16px}button{background:#FFB800;color:#04301F;border:0;border-radius:999px;padding:10px 22px;font:inherit;font-weight:600;cursor:pointer;margin:4px 0}button.alt{background:#fff;border:1px solid #E4DFCF}button[disabled]{opacity:.6}input{font:inherit;padding:8px 12px;border:1px solid #E4DFCF;border-radius:10px;width:9em}pre{white-space:pre-wrap;background:#fff;border-radius:12px;padding:14px;direction:ltr;text-align:left;font-size:12px}li{margin:4px 0}details{margin-top:12px}</style></head>
<body><h1>بناء الأذكار (S6)</h1>
<p>يجلب أحاديث «أذكار الصباح والمساء» و«الأذكار بعد الصلاة» من موسوعة الأحاديث عبر خادم MCP، بالعربية ثم بلغات الواجهة المتاحة في الموسوعة، مع الدرجة والرابط، ويحفظها في جدول <code>adhkar</code>. لا يُدرج ذكر درجته غير صحيح أو حسن. إعادة البناء آمنة (تستبدل القديم).</p>
<button id="run">ابنِ الأذكار</button> <button id="probe" class="alt">فحص (بلا حفظ)</button>
<details><summary>معرّفات الأبواب يدوياً (اختياري، إن لم يجدها البحث بالعنوان)</summary>
<p>الصباح والمساء: <input id="me" inputmode="numeric"> · بعد الصلاة: <input id="ap" inputmode="numeric"></p></details>
<ul id="log"></ul><pre id="tree" hidden style="direction:rtl;text-align:right;font-size:13px"></pre><pre id="out" hidden></pre>
<script>
const LANGS=${langs};
const log=document.getElementById("log"),out=document.getElementById("out"),tree=document.getElementById("tree"),run=document.getElementById("run"),pr=document.getElementById("probe");
function showTree(t){if(!t||!t.length)return;tree.hidden=false;tree.textContent="شجرة الأبواب المتصفَّحة (← المطابق، [عدد الفروع]):\\n"+t.join("\\n")}
function line(t){const li=document.createElement("li");li.textContent=t;log.appendChild(li);return li}
function cats(){const c=[];const me=document.getElementById("me").value.trim(),ap=document.getElementById("ap").value.trim();
if(me)c.push({id:me,title:"manual",kind:"morningEvening"});if(ap)c.push({id:ap,title:"manual",kind:"afterPrayer"});return c}
async function post(body){const r=await fetch(location.pathname,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
const j=await r.json().catch(()=>({error:"HTTP "+r.status}));if(!r.ok||j.error){const e=new Error(j.error||("HTTP "+r.status));e.data=j;throw e}return j}
run.onclick=async()=>{run.disabled=pr.disabled=true;log.innerHTML="";out.hidden=true;tree.hidden=true;
for(const lang of LANGS){const li=line(lang+": جارٍ…");
try{const j=await post({lang,categories:cats()});
li.textContent=lang+": حُفظ "+j.saved+" من "+j.listed+(j.skippedNoGrade.length?" · استُبعد لدرجته "+j.skippedNoGrade.length:"")+(j.missing.length?" · لا نص "+j.missing.length:"");
if(lang==="ar"){showTree(j.tree);out.hidden=false;out.textContent="الأبواب: "+JSON.stringify(j.categories,null,1)+"\\nالمستبعد: "+JSON.stringify(j.skippedNoGrade,null,1)}}
catch(e){li.textContent=lang+": تعذّر — "+e.message;if(lang==="ar"){showTree(e.data&&e.data.tree);break}}}
run.disabled=pr.disabled=false};
pr.onclick=async()=>{pr.disabled=true;out.hidden=false;out.textContent="…";tree.hidden=true;
try{const j=await post({probe:true,categoryId:document.getElementById("me").value.trim()||undefined});showTree(j.tree);out.textContent=JSON.stringify(j,null,2)}
catch(e){out.textContent=String(e)}finally{pr.disabled=false}};
</script></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

function parseCategories(raw: unknown): CategoryRef[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is CategoryRef =>
      Boolean(c) && /^\d{1,9}$/.test(String(c.id)) && (c.kind === "morningEvening" || c.kind === "afterPrayer"),
    )
    .map((c) => ({ id: String(c.id), title: String(c.title ?? "manual").slice(0, 100), kind: c.kind }));
}

export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  // حماية من الطلبات القادمة من مواقع أخرى (CSRF).
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as { lang?: string; probe?: boolean; categoryId?: string; categories?: unknown };
  const noStore = { headers: { "Cache-Control": "no-store" } };

  try {
    if (body.probe) {
      const id = /^\d{1,9}$/.test(String(body.categoryId ?? "")) ? String(body.categoryId) : undefined;
      return Response.json(await probe(id), noStore);
    }
    const lang = String(body.lang ?? "");
    if (!BUILD_LANGS.includes(lang)) return Response.json({ error: "unknown lang" }, { status: 400 });
    if (!isAdminClientConfigured()) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, { status: 503 });

    const report = lang === "ar" ? await buildArabic(parseCategories(body.categories)) : await buildTranslation(lang, await arabicRows());
    // لا نمسح المحفوظ ببناء فارغ (انقطاع، أو لغة غير متاحة في الموسوعة).
    if (report.rows.length) await saveRows(lang, report.rows);
    else if (lang === "ar") {
      const error = report.categories.length
        ? "لم يُقبل أي ذكر: لم يُحفظ شيء (استعمل «فحص»)."
        : "لم يُعثر على بابي الأذكار في شجرة الأبواب حتى عمق 3: لم يُحفظ شيء (الشجرة المتصفَّحة أدناه، ويمكن إدخال المعرّفين يدوياً).";
      return Response.json({ ...report, rows: undefined, error }, { status: 422 });
    }
    return Response.json({ ...report, rows: undefined }, noStore);
  } catch (error) {
    return Response.json({ error: String((error as Error)?.message ?? error) }, { status: 502 });
  }
}
