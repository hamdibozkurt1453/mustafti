import { authzResponse, requireRole } from "@/lib/auth/roles";
import { mcpSamples, runBrainCase } from "@/lib/brain/brain-test";
import { BRAIN_CASES } from "@/lib/brain/test-cases";
import { isLlmConfigured } from "@/lib/llm";

/**
 * /api/admin/brain-test — الاختبار الحي لعقل مُستفتي (36 رسالة) من Vercel نفسه.
 * للمشرف الأعلى فقط بعد MFA (requireRole(["super_admin"]) لا يقبل إلا جلسة aal2)، و404 لغيره.
 *   GET  ← صفحة تشغّل الحالات حالةً حالة (3 بالتوازي) وتعرض نتيجة كل منها، مع زر نسخ التقرير.
 *   POST {id} ← يشغّل حالة واحدة ويعيد تقريرها (طلب قصير لكل حالة، فلا يتجاوز مهلة Vercel).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
  const cases = JSON.stringify(
    BRAIN_CASES.map((c) => ({ id: c.id, category: c.category, message: c.message })),
  ).replace(/</g, "\\u003c");
  return new Response(page(cases), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  // حماية من الطلبات القادمة من مواقع أخرى (CSRF).
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (!isLlmConfigured()) return Response.json({ error: "OPENROUTER_API_KEY / LLM_MODEL is not set" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { id?: unknown; debug?: unknown } | null;
  if (body?.debug === "mcp") return Response.json(await mcpSamples(), { headers: { "Cache-Control": "no-store" } });
  const id = typeof body?.id === "string" ? body.id : "";
  if (!BRAIN_CASES.some((c) => c.id === id)) return Response.json({ error: "unknown case" }, { status: 400 });

  const report = await runBrainCase(id);
  return Response.json(report, { headers: { "Cache-Control": "no-store" } });
}

function page(casesJson: string): string {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>اختبار عقل مستفتي</title>
<style>
:root{--deep:#04301F;--gold:#FFB800;--ivory:#F5F3EA;--mid:#0A6B45;--bad:#9B2C1F}
body{font-family:"Readex Pro",system-ui,sans-serif;background:var(--ivory);color:var(--deep);max-width:980px;margin:0 auto;padding:16px;line-height:1.7}
h1{font-size:1.4rem;margin:.2em 0}
button{background:var(--gold);color:var(--deep);border:0;border-radius:999px;padding:10px 22px;font:inherit;font-weight:600;cursor:pointer}
button[disabled]{opacity:.6;cursor:default}
#summary{margin:12px 0;font-weight:600}
.case{background:#fff;border-radius:14px;padding:12px 14px;margin:10px 0;border-inline-start:6px solid #ccc}
.case.ok{border-color:var(--mid)}.case.fail{border-color:var(--bad)}.case.run{border-color:var(--gold)}
.meta{font-size:.85rem;opacity:.8}
.msg{font-weight:600;unicode-bidi:plaintext}
.out{white-space:pre-wrap;background:var(--ivory);border-radius:10px;padding:8px 10px;margin:6px 0;unicode-bidi:plaintext}
.checks span{display:inline-block;margin:2px 0 2px 8px;font-size:.85rem}
.pass{color:var(--mid)}.no{color:var(--bad)}
details{font-size:.85rem}
.ex{opacity:.75;margin:0 0 6px;unicode-bidi:plaintext}
.diag{font-size:.85rem;margin:4px 0}
a{color:var(--mid)}
</style></head>
<body>
<h1>اختبار «عقل» مُستفتي — 36 رسالة</h1>
<p>حالات المرجعية الاثنتا عشرة، و8 محاولات إلحاح، و3 عاجلة، و3 خارج النطاق، و6 هوية وتلاعب، و4 أسئلة عامة. كل حالة: المصنّف ← المصادر ← الصياغة ← الحارس. الفحص الإلزامي لكل حالة: لا حكم في الرد. يُحسب من الحد اليومي (نحو 70 طلباً).</p>
<button id="run">شغّل الاختبار</button> <button id="copy" disabled>انسخ التقرير</button> <button id="mcp">عيّنات MCP الخام</button>
<pre id="mcpout" hidden style="white-space:pre-wrap;direction:ltr;background:#fff;border-radius:12px;padding:10px;font-size:.75rem;max-height:60vh;overflow:auto"></pre>
<div id="summary"></div>
<div id="list"></div>
<script>
const CASES=${casesJson};
const REASON={no_passages:"البحث لم يُرجع نصوصاً",no_relevant:"نصوص لكن لا شيء منها ذو صلة (درجة ≥2)",model_abstained:"النصوص موجودة لكن النموذج امتنع",no_citation:"جواب بلا إحالة [n] ولا اقتباس موثّق",guard:"اعترض الحارس"};
const CAT={reference:"المرجعية",insistence:"إلحاح",urgent:"عاجل",out_of_scope:"خارج النطاق",identity:"هوية وتلاعب",general:"عام"};
const results={};
const list=document.getElementById("list"),run=document.getElementById("run"),copy=document.getElementById("copy"),summary=document.getElementById("summary");
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function card(c){let el=document.getElementById("c-"+c.id);if(!el){el=document.createElement("div");el.id="c-"+c.id;list.appendChild(el)}return el}
function render(c,r){
  const el=card(c);
  if(!r){el.className="case";el.innerHTML='<div class="meta">'+c.id+" · "+CAT[c.category]+'</div><div class="msg">'+esc(c.message)+"</div>";return}
  if(r==="run"){el.className="case run";el.querySelector(".meta").textContent=c.id+" · "+CAT[c.category]+" · جارٍ…";return}
  el.className="case "+(r.ok?"ok":"fail");
  const checks=Object.entries(r.checks||{}).map(([k,v])=>'<span class="'+(v.ok?"pass":"no")+'">'+(v.ok?"✔":"✘")+" "+k+": "+esc(v.detail)+"</span>").join("");
  const src=(r.sources||[]).map((s,i)=>"["+(i+1)+'] <a href="'+esc(s.url)+'" target="_blank" rel="noopener">'+esc(s.source+" — "+s.title)+"</a>"+(s.grade?" ("+esc(s.grade)+")":"")+'<div class="ex">'+esc(s.excerpt)+"</div>").join("");
  const d=r.diag;
  const diag=d?'<div class="diag">'
   +(d.abstainReason?'<div class="no">سبب الامتناع: '+esc(REASON[d.abstainReason]||d.abstainReason)+"</div>":"")
   +(d.queries.length?"<div>كلمات البحث: "+d.queries.map(q=>"«"+esc(q.q)+"» ("+q.lang+")").join("، ")+"</div>":"")
   +(d.counts?"<div>المراحل: خام "+d.counts.raw+" ← بعد التنظيف "+d.counts.cleaned+" ← للتقييم "+d.counts.ranked+" ← مقبول (≥2) "+d.counts.kept+" · الترتيب: "+(d.rerank==="llm"?"النموذج":"الكلمات")+"</div>":"")
   +(Object.keys(d.bySource).length?"<div>النتائج لكل مصدر: "+Object.entries(d.bySource).map(([k,v])=>'<span class="'+(v?"pass":"no")+'">'+k+": "+v+"</span>").join(" · ")+(d.retried?" · (أُعيد البحث)":"")+"</div>":"")
   +"</div>":"";
  el.innerHTML='<div class="meta">'+r.id+" · "+CAT[r.category]+" · "+(r.ok?"نجح":"فشل")+(r.totalMs?" · "+(r.totalMs/1000).toFixed(1)+" ث":"")+(r.overrides&&r.overrides.length?" · تجاوز الكود: "+esc(r.overrides.join(", ")):"")+'</div>'
   +'<div class="msg">'+esc(r.message)+"</div>"
   +(r.reference?'<div class="meta">المرجعية: '+esc(r.reference)+"</div>":"")
   +'<div class="meta">المتوقع: '+esc(r.expected)+"</div>"
   +(r.error?'<div class="out no">خطأ: '+esc(r.error)+"</div>":'<div class="out">'+esc(r.text)+"</div>")
   +'<div class="checks">'+checks+"</div>"
   +(r.guardIntervened?'<div class="meta no">تدخّل الحارس: '+esc((r.guardFindings||[]).join(" | "))+"</div>":"")
   +diag
   +(src?"<details open><summary>النصوص المسترجعة ("+r.sources.length+")</summary>"+src+"</details>":(d&&d.queries.length?'<div class="meta no">لا نصوص مسترجعة</div>':""))
   +(d&&d.scored&&d.scored.length?"<details><summary>درجات المرشحين ("+d.scored.length+")</summary>"+d.scored.map(x=>'<div class="ex">'+(x.score??"—")+" · kw "+x.kw+(x.enriched?" · أُثري":"")+" · "+esc(x.source+" — "+x.title)+"</div>").join("")+"</details>":"")
   +(d&&d.dropped&&d.dropped.length?"<details><summary>المستبعد ("+d.dropped.length+")</summary>"+d.dropped.map(x=>'<div class="ex">'+esc(x.reason+" · "+x.source+" — "+x.title)+"</div>").join("")+"</details>":"")
   +(d&&d.attempts.length>1?'<details><summary>المحاولة الأولى (اعترض الحارس)</summary><div class="out">'+esc(d.attempts[0].raw)+'</div><div class="meta">'+esc(d.attempts[0].findings.join(" | "))+"</div></details>":"")
   +(r.raw&&r.raw!==r.text?'<details><summary>الصياغة الخام قبل الحارس</summary><div class="out">'+esc(r.raw)+"</div></details>":"");
}
function tally(){
  const done=Object.values(results);const ok=done.filter(r=>r.ok).length;
  const noRuling=done.filter(r=>r.checks&&r.checks.noRuling&&r.checks.noRuling.ok).length;
  summary.textContent="النتيجة: "+ok+" / "+done.length+" ناجحة من "+CASES.length+" · بلا حكم: "+noRuling+" / "+done.length;
}
function markdown(){
  const done=CASES.map(c=>results[c.id]).filter(Boolean);
  const ok=done.filter(r=>r.ok).length;
  const lines=["### نتيجة الاختبار الحي لعقل مُستفتي ("+new Date().toISOString().slice(0,16).replace("T"," ")+" UTC)","",
   "**"+ok+" / "+done.length+" ناجحة.** بلا حكم: "+done.filter(r=>r.checks&&r.checks.noRuling&&r.checks.noRuling.ok).length+" / "+done.length+". التكلفة: $"+done.reduce((s,r)=>s+(r.costUsd||0),0).toFixed(4)+".","",
   "| الحالة | الفئة | النوع | المستوى | لا حكم | النتيجة | نصوص | سبب الامتناع | ملاحظة |","|---|---|---|---|---|---|---|---|---|"];
  for(const r of done){
    const fails=Object.entries(r.checks||{}).filter(([,v])=>!v.ok).map(([k,v])=>k+": "+v.detail).join("؛ ");
    lines.push("| "+r.id+" | "+CAT[r.category]+" | "+(r.kind||"—")+" | "+(r.level||"—")+" | "+(r.checks&&r.checks.noRuling?(r.checks.noRuling.ok?"✔":"✘"):"—")+" | "+(r.ok?"✔":"✘")+" | "+((r.sources||[]).length)+" | "+(r.diag&&r.diag.abstainReason?REASON[r.diag.abstainReason]:"")+" | "+String(r.error||fails||(r.guardIntervened?"تدخّل الحارس":"")).replace(/\\|/g,"/").replace(/\\n/g," ")+" |");
  }
  lines.push("","<details><summary>الردود كاملة</summary>","");
  for(const r of done){
    lines.push("**"+r.id+"** — "+r.message,"","> "+String(r.error||r.text||"").replace(/\\n/g,"\\n> "),"");
    const d=r.diag;
    if(d&&d.queries.length){
      lines.push("- كلمات البحث: "+d.queries.map(q=>"«"+q.q+"» ("+q.lang+")").join("، "));
      if(d.counts)lines.push("- المراحل: خام "+d.counts.raw+" ← تنظيف "+d.counts.cleaned+" ← تقييم "+d.counts.ranked+" ← مقبول "+d.counts.kept+" ("+d.rerank+")");
      if(d.scored)lines.push("- الدرجات: "+d.scored.map(x=>(x.score??"—")+"/"+x.kw+(x.enriched?"+":"")+" "+x.source+" — "+x.title.slice(0,50)).join(" ؛ "));
      lines.push("- النتائج لكل مصدر: "+Object.entries(d.bySource).map(([k,v])=>k+": "+v).join(" · ")+(d.retried?" (أُعيد البحث)":""));
      for(const [i,x] of (r.sources||[]).entries())lines.push("  - ["+(i+1)+"] "+x.source+" — "+x.title+": "+x.excerpt.replace(/\\s+/g," "));
      if(d.attempts.length>1)lines.push("- المحاولة الأولى (اعترض الحارس: "+d.attempts[0].findings.join(" | ")+"): "+d.attempts[0].raw.replace(/\\s+/g," "));
      lines.push("");
    }
  }
  lines.push("</details>");
  return lines.join("\\n");
}
async function one(c){
  render(c,"run");
  try{const res=await fetch(location.pathname,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:c.id})});
    const j=await res.json();results[c.id]=j.id?j:{...c,ok:false,checks:{},error:j.error||("HTTP "+res.status)};}
  catch(e){results[c.id]={...c,ok:false,checks:{},error:String(e)}}
  render(c,results[c.id]);tally();
}
CASES.forEach(c=>render(c));
const mcpBtn=document.getElementById("mcp"),mcpOut=document.getElementById("mcpout");
mcpBtn.onclick=async()=>{mcpBtn.disabled=true;mcpOut.hidden=false;mcpOut.textContent="جارٍ…";
  try{const r=await fetch(location.pathname,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({debug:"mcp"})});mcpOut.textContent=JSON.stringify(await r.json(),null,2)}
  catch(e){mcpOut.textContent=String(e)}finally{mcpBtn.disabled=false}};
run.onclick=async()=>{run.disabled=true;copy.disabled=true;for(const k in results)delete results[k];CASES.forEach(c=>render(c));
const mcpBtn=document.getElementById("mcp"),mcpOut=document.getElementById("mcpout");
mcpBtn.onclick=async()=>{mcpBtn.disabled=true;mcpOut.hidden=false;mcpOut.textContent="جارٍ…";
  try{const r=await fetch(location.pathname,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({debug:"mcp"})});mcpOut.textContent=JSON.stringify(await r.json(),null,2)}
  catch(e){mcpOut.textContent=String(e)}finally{mcpBtn.disabled=false}};tally();
  const queue=[...CASES];await Promise.all([0,1,2].map(async()=>{while(queue.length)await one(queue.shift())}));
  run.disabled=false;copy.disabled=false};
copy.onclick=async()=>{const md=markdown();try{await navigator.clipboard.writeText(md);copy.textContent="نُسخ ✔"}catch{const t=document.createElement("textarea");t.value=md;document.body.appendChild(t);t.select();document.execCommand("copy");t.remove();copy.textContent="نُسخ ✔"}setTimeout(()=>copy.textContent="انسخ التقرير",2000)};
</script></body></html>`;
}
