import { authzResponse, requireRole } from "@/lib/auth/roles";
import { classify } from "@/lib/brain/classify";
import { looksHadithCheck, quotedSegment, rerank, searchBayyinat, type Candidate } from "@/lib/brain/retrieval";
import { keywords } from "@/lib/brain/rank";
import { isLlmConfigured } from "@/lib/llm";
import { clip } from "@/lib/sources/html";
import { PROBE_SOURCES, runProbeSource, type ProbeSourceId } from "@/lib/sources/probe";
import type { SourceResult } from "@/lib/sources/types";

/**
 * /api/admin/sources-probe — فحص المصادر حياً من Vercel (بيئة التطوير لا تصل إلى الإنترنت).
 * للمشرف الأعلى فقط (requireRole في الخادم لكل طلب)، و404 لغيره.
 *   GET  ← صفحة: خانة سؤال، ثم عبارات البحث (2–4 من المصنّف)، ثم كل مصدر على حدة بالتوازي:
 *          الحالة، والزمن، وعدد النتائج، وأول 3 نتائج بدرجة صلتها (0–100)، وملاحظات الرد الخام.
 *   POST {action:"queries", question} ← التصنيف وعبارات البحث.
 *   POST {action:"source", source, question, queries, lang, level} ← مصدر واحد.
 * لا يُحفظ شيء.
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
  const sources = JSON.stringify(PROBE_SOURCES.map(({ id, label }) => ({ id, label }))).replace(/</g, "\\u003c");
  return new Response(page(sources), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

type Body = { action?: unknown; question?: unknown; source?: unknown; queries?: unknown; lang?: unknown; level?: unknown };

export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const body = ((await request.json().catch(() => null)) ?? {}) as Body;
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 600) : "";
  if (!question) return Response.json({ error: "empty question" }, { status: 400 });
  const noStore = { headers: { "Cache-Control": "no-store" } };

  if (body.action === "queries") {
    if (!isLlmConfigured()) return Response.json({ ar: [question], userLang: [], lang: "ar", level: null, note: "النموذج غير مُعد" }, noStore);
    const t0 = Date.now();
    try {
      const { classification: c } = await classify(question);
      return Response.json(
        {
          ar: c.searchQueries.ar,
          userLang: c.searchQueries.userLang,
          lang: c.lang,
          level: c.level,
          hadithCheck: looksHadithCheck(question),
          quoted: quotedSegment(question),
          ms: Date.now() - t0,
        },
        noStore,
      );
    } catch (error) {
      return Response.json({ ar: [question], userLang: [], lang: "ar", level: null, error: String((error as Error)?.message ?? error) }, noStore);
    }
  }

  const def = PROBE_SOURCES.find((s) => s.id === body.source);
  if (body.action !== "source" || !def) return Response.json({ error: "unknown source" }, { status: 400 });
  const queries = Array.isArray(body.queries) ? body.queries.filter((q): q is string => typeof q === "string" && q.trim().length > 0).slice(0, 4) : [];
  const lang = typeof body.lang === "string" && /^[a-z]{2,3}$/.test(body.lang) ? body.lang : "ar";
  const level = typeof body.level === "string" ? body.level : null;

  const t0 = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const bayyinat = async (q: string): Promise<SourceResult[]> =>
      (await searchBayyinat(q, [], 5)).map((x) => ({ ...x, sourceId: "dawa_center" as const, lang: x.lang ?? "ar" }));
    const outcome = await Promise.race([
      runProbeSource(def.id as ProbeSourceId, question, queries, lang, bayyinat),
      new Promise<"timeout">((r) => (timer = setTimeout(() => r("timeout"), def.deadlineMs))),
    ]);
    const ms = Date.now() - t0;
    if (outcome === "timeout") return Response.json({ status: "timeout", ms, count: 0, results: [], notes: [`المهلة ${def.deadlineMs}ms`] }, noStore);

    // درجة الصلة لأول 3 نتائج (طلب واحد للنموذج)، بالسلّم نفسه في المحادثة.
    const top: Candidate[] = outcome.results.slice(0, 3).map((r) => ({ ...r, kw: 0 }));
    let scoring = "—";
    if (top.length && isLlmConfigured()) {
      const terms = [...new Set([...keywords(question), ...queries.flatMap((q) => keywords(q))])];
      const res = await rerank(question, top, terms, level === "D" && def.id === "qp_fatwas" ? "case" : "general");
      scoring = res.mode;
    }
    return Response.json(
      {
        status: outcome.results.length ? "ok" : "empty",
        ms,
        count: outcome.results.length,
        scoring,
        notes: outcome.notes,
        results: top.map((r) => ({
          title: r.title,
          url: r.url,
          source: r.source,
          grade: r.grade,
          mufti: r.fatwa?.mufti,
          excerpt: clip(r.fatwa ? r.fatwa.answer : r.text, 400),
          score: r.score,
        })),
      },
      noStore,
    );
  } catch (error) {
    return Response.json({ status: "error", ms: Date.now() - t0, count: 0, results: [], error: String((error as Error)?.message ?? error).slice(0, 300) }, noStore);
  } finally {
    clearTimeout(timer);
  }
}

function page(sourcesJson: string): string {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>فحص المصادر</title>
<style>
:root{--deep:#04301F;--gold:#FFB800;--ivory:#F5F3EA;--mid:#0A6B45;--bad:#9B2C1F;--sand:#E4DFCF}
body{font-family:"Readex Pro",system-ui,sans-serif;background:var(--ivory);color:var(--deep);max-width:1000px;margin:0 auto;padding:16px;line-height:1.7}
h1{font-size:1.4rem;margin:.2em 0}
textarea{width:100%;box-sizing:border-box;font:inherit;padding:10px 12px;border:1px solid var(--sand);border-radius:12px;min-height:70px}
button{background:var(--gold);color:var(--deep);border:0;border-radius:999px;padding:10px 22px;font:inherit;font-weight:600;cursor:pointer;margin:8px 0}
button[disabled]{opacity:.6;cursor:default}
.ex{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}.ex a{background:#fff;border:1px solid var(--sand);border-radius:999px;padding:3px 10px;font-size:.85rem;cursor:pointer;color:var(--deep);text-decoration:none}
#q{background:#fff;border-radius:12px;padding:8px 12px;margin:8px 0;font-size:.9rem}
.src{background:#fff;border-radius:14px;padding:10px 14px;margin:10px 0;border-inline-start:6px solid #ccc}
.src.ok{border-color:var(--mid)}.src.empty{border-color:var(--gold)}.src.error,.src.timeout{border-color:var(--bad)}.src.run{border-color:var(--sand)}
.head{display:flex;flex-wrap:wrap;gap:10px;align-items:baseline;font-weight:600}
.badge{font-size:.8rem;border-radius:999px;padding:1px 10px;background:var(--ivory)}
.res{border-top:1px solid var(--sand);padding:6px 0;font-size:.9rem;unicode-bidi:plaintext}
.score{font-weight:700}.hi{color:var(--mid)}.lo{color:var(--bad)}
.note{font-size:.8rem;opacity:.75;unicode-bidi:plaintext}
a{color:var(--mid)}
</style></head><body>
<h1>فحص المصادر</h1>
<p>اكتب سؤالاً، فيصوغ المصنّف 2–4 عبارات بحث، ثم يُشغَّل كل مصدر على حدة (بلا ذاكرة مؤقتة لمصادر HTTP): الحالة، والزمن، وعدد النتائج، وأول 3 نتائج بدرجة صلتها من 100 (يُقبل في المحادثة ما بلغ 60).</p>
<div class="ex">
<a data-q="ما حكم قضاء صلاة الفجر بعد طلوع الشمس؟">قضاء صلاة الفجر</a>
<a data-q="هل حديث «اطلبوا العلم ولو بالصين» صحيح؟">التحقق من حديث</a>
<a data-q="ما تفسير آية الكرسي 2:255؟">تفسير 2:255</a>
<a data-q="طلقت زوجتي وأنا غاضب جداً، هل وقع الطلاق؟">حالة شخصية (D)</a>
<a data-q="لماذا يصوم المسلمون في رمضان؟">سؤال عام</a>
</div>
<textarea id="question" placeholder="السؤال"></textarea>
<button id="run">شغّل الفحص</button>
<div id="q" hidden></div>
<div id="out"></div>
<script>
const SOURCES=${sourcesJson};
const $=(id)=>document.getElementById(id);
document.querySelectorAll(".ex a").forEach(a=>a.onclick=()=>{$("question").value=a.dataset.q});
async function post(body){const r=await fetch(location.pathname,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
const j=await r.json().catch(()=>({error:"HTTP "+r.status}));if(!r.ok&&!j.status)throw new Error(j.error||("HTTP "+r.status));return j}
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e}
function render(box,label,j){box.className="src "+(j.status||"error");box.innerHTML="";
const h=el("div","head");h.append(el("span","",label),el("span","badge",j.status||"error"),el("span","badge",(j.ms??"—")+"ms"),el("span","badge","النتائج: "+(j.count??0)));
if(j.scoring)h.append(el("span","badge","الصلة: "+j.scoring));box.append(h);
if(j.error)box.append(el("div","note","الخطأ: "+j.error));
(j.notes||[]).forEach(n=>box.append(el("div","note",n)));
(j.results||[]).forEach((r,i)=>{const d=el("div","res");
const s=el("span","score "+(r.score>=60?"hi":"lo"),r.score===undefined||r.score===null?"—":String(r.score));
d.append(el("b","",(i+1)+". "),s,el("span",""," · "+r.title));
const m=[r.source,r.mufti?"المفتي: "+r.mufti:"",r.grade?"الدرجة: "+r.grade:""].filter(Boolean).join(" · ");
d.append(el("div","note",m));d.append(el("div","",r.excerpt||""));
const a=el("a","",r.url);a.href=r.url;a.target="_blank";a.rel="noopener noreferrer";d.append(a);box.append(d)})}
$("run").onclick=async()=>{const question=$("question").value.trim();if(!question)return;
$("run").disabled=true;$("out").innerHTML="";$("q").hidden=false;$("q").textContent="أصوغ عبارات البحث…";
let qs;try{qs=await post({action:"queries",question})}catch(e){qs={ar:[question],userLang:[],lang:"ar",error:String(e)}}
$("q").textContent="عبارات البحث: "+(qs.ar||[]).join(" · ")+(qs.userLang&&qs.userLang.length?" | بلغة السائل: "+qs.userLang.join(" · "):"")+" — اللغة: "+qs.lang+" — المستوى: "+(qs.level??"—")+(qs.hadithCheck?" — تحقق من حديث":"")+(qs.quoted?" — المنقول: «"+qs.quoted+"»":"")+(qs.ms?" — "+qs.ms+"ms":"")+(qs.error?" — "+qs.error:"");
const boxes=SOURCES.map(s=>{const b=el("div","src run");b.append(el("div","head",s.label+" — جارٍ…"));$("out").append(b);return b});
let next=0;async function worker(){while(next<SOURCES.length){const i=next++;const s=SOURCES[i];
const queries=s.id==="dorar"&&qs.quoted?[qs.quoted,...(qs.ar||[])]:(qs.ar||[question]);
try{render(boxes[i],s.label,await post({action:"source",source:s.id,question,queries,lang:qs.lang||"ar",level:qs.level}))}
catch(e){render(boxes[i],s.label,{status:"error",error:String(e)})}}}
await Promise.all([worker(),worker(),worker()]);$("run").disabled=false};
</script></body></html>`;
}
