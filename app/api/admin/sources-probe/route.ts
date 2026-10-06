import { authzResponse, requireRole } from "@/lib/auth/roles";
import { classify } from "@/lib/brain/classify";
import { isChatMode } from "@/lib/brain/modes";
import { respond } from "@/lib/brain/respond";
import { personaIssues } from "@/lib/brain/personas";
import { looksHadithCheck, quotedSegment, rerank, searchBayyinat, webCandidates, type Candidate } from "@/lib/brain/retrieval";
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
  const sources = JSON.stringify(PROBE_SOURCES.map(({ id, label }) => ({ id, label }))).replace(/</g, "\\u003c");
  return new Response(page(sources), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

type Body = { action?: unknown; question?: unknown; source?: unknown; queries?: unknown; lang?: unknown; level?: unknown; mode?: unknown };

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

  // «شغّل الكل»: الرد كاملاً (التصنيف ← المصادر ← الصياغة ← الحارس) بلا ذاكرة الأجوبة، وملخصه.
  // R3: mode اختياري (new_muslim أو discover) لأسئلة المحادثتين الموجّهتين.
  if (body.action === "full") {
    if (!isLlmConfigured()) return Response.json({ error: "OPENROUTER_API_KEY / LLM_MODEL is not set" }, { status: 503 });
    const t0 = Date.now();
    const mode = isChatMode(body.mode) ? body.mode : "general";
    try {
      const r = await respond(question, { mode });
      const web = r.diag.retrieval?.web ?? r.diag.caseFatwas?.web;
      return Response.json(
        {
          mode,
          kind: r.kind,
          level: r.classification?.level ?? null,
          userType: r.classification?.userType ?? null,
          sources: [...new Set(r.passages.map((p) => p.source))].slice(0, 6),
          overrides: r.overrides,
          accepted: r.passages.length,
          fatwas: r.fatwas?.length ?? 0,
          links: r.links?.length ?? 0,
          abstained: r.kind === "abstain" || r.kind === "refused",
          abstainReason: r.diag.abstainReason ?? null,
          attempts: r.diag.attempts.map((a) => ({ guardOk: a.guardOk, findings: a.findings.slice(0, 3), head: a.raw.slice(0, 160) })),
          ms: Date.now() - t0,
          timings: r.timings,
          stages: r.diag.retrieval?.stages ?? null,
          // R5: «فحص الشخصية» على الجواب كاملاً: لا «تذكر المصادر» ولا «أكثر من صياغة».
          persona: r.kind === "answer" ? personaIssues(r.text) : [],
          // R5b: «اكتمال» السؤال العملي (نسبة عناصر القائمة في الجواب، والناقص منها)، وما وُجد له نص.
          checklist: r.checklist ? { ...r.checklist, found: r.diag.retrieval?.checklist?.found ?? [] } : null,
          fixes: r.guard?.findings.filter((f) => !f.verdict && f.reason !== "identity_leak").map((f) => f.match).slice(0, 4) ?? [],
          web: web
            ? { verified: web.verified, linkOnly: web.linkOnly, ms: web.ms, searchOnly: Boolean(web.searchOnly), jsonRecovery: web.jsonRecovery, error: web.error }
            : null,
          text: r.text.slice(0, 300),
        },
        noStore,
      );
    } catch (error) {
      return Response.json({ error: String((error as Error)?.message ?? error).slice(0, 300), ms: Date.now() - t0 }, noStore);
    }
  }

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
      runProbeSource(def.id as ProbeSourceId, question, queries, lang, level, bayyinat),
      new Promise<"timeout">((r) => (timer = setTimeout(() => r("timeout"), def.deadlineMs))),
    ]);
    const ms = Date.now() - t0;
    if (outcome === "timeout") return Response.json({ status: "timeout", ms, count: 0, results: [], notes: [`المهلة ${def.deadlineMs}ms`] }, noStore);

    // درجة الصلة (طلب واحد للنموذج) بالسلّم نفسه في المحادثة: لأول 3 نتائج، وللفتاوى كلها مرتبة.
    // ومصادر «ابحث واقرأ» تُقيَّم كما في المحادثة (الموثَّق بنص اقتباسه، و«رابط فقط» بعنوانه).
    const fromWeb = outcome.web ? webCandidates(outcome.web.sources) : [];
    const pool: Candidate[] = fromWeb.length ? fromWeb : outcome.results.slice(0, def.scoreAll ? 20 : 3).map((r) => ({ ...r, kw: 0 }));
    let scoring = "—";
    if (pool.length && isLlmConfigured()) {
      const terms = [...new Set([...keywords(question), ...queries.flatMap((q) => keywords(q))])];
      const res = await rerank(question, pool, terms, level === "D" && (def.id === "qp_fatwas" || def.id === "web") ? "case" : "general");
      scoring = res.mode;
    }
    const top = def.scoreAll ? [...pool].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)) : pool;
    const web = outcome.web
      ? {
          ok: outcome.web.ok,
          queries: outcome.web.queries,
          fetched: outcome.web.fetched,
          sources: outcome.web.sources.map((x) => ({ ...x, score: fromWeb.find((c) => c.url === x.url)?.score })),
          dropped: outcome.web.dropped,
          explanation: outcome.web.explanation,
          costUsd: outcome.web.costUsd,
          toolUse: outcome.web.toolUse,
          error: outcome.web.error,
        }
      : undefined;
    const count = outcome.web ? outcome.web.sources.length : outcome.results.length;
    return Response.json(
      {
        status: outcome.skipped ? "skipped" : outcome.tools ? "ok" : count ? "ok" : "empty",
        ms,
        count: outcome.tools ? outcome.tools.length : count,
        scoring,
        notes: outcome.notes,
        raw: outcome.raw,
        tools: outcome.tools,
        web,
        results: (outcome.web ? [] : top).map((r) => ({
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
.src.skipped{border-color:var(--sand);opacity:.8}
pre.raw{white-space:pre-wrap;direction:ltr;text-align:left;background:var(--ivory);border-radius:10px;padding:8px;font-size:11px;max-height:320px;overflow:auto}
.ok-q{color:var(--mid);font-weight:600}.bad-q{color:var(--bad);font-weight:600}
#table td,#table th{border-bottom:1px solid var(--sand);padding:6px;text-align:start;vertical-align:top;unicode-bidi:plaintext}
.quote{background:var(--ivory);border-inline-start:3px solid var(--gold);padding:4px 10px;margin:4px 0;white-space:pre-wrap}
a{color:var(--mid)}
</style></head><body>
<h1>فحص المصادر</h1>
<p>اكتب سؤالاً، فيصوغ المصنّف 2–4 عبارات بحث، ثم يُشغَّل كل مصدر على حدة (بلا ذاكرة مؤقتة لمصادر HTTP): الحالة، والزمن، وعدد النتائج، وأول 3 نتائج بدرجة صلتها من 100 (يُقبل في المحادثة ما بلغ 60).</p>
<div class="ex">
<a data-q="ما حكم قضاء صلاة الفجر بعد طلوع الشمس؟">حكم عام: قضاء الفجر</a>
<a data-q="هل حديث «اطلبوا العلم ولو بالصين» صحيح؟">التحقق من حديث</a>
<a data-q="ما تفسير آية الكرسي 2:255؟">تفسير 2:255</a>
<a data-q="طلقت زوجتي وأنا غاضب جداً، هل وقع الطلاق؟">حالة شخصية (D)</a>
<a data-q="لماذا يصوم المسلمون في رمضان؟">سؤال عام</a>
</div>
<details open><summary><b>شغّل الكل</b>: اثنان وعشرون سؤالاً متنوعاً بالرد كاملاً (المستوى، والمصادر المقبولة، والزمن، والامتناع)، منها سبعة للمحادثتين الموجّهتين: «المرشد» (new_muslim) و«الداعية» (discover)</summary>
<ol id="suite" style="font-size:.85rem;margin:6px 0"></ol>
<button id="runAll">شغّل الكل</button>
<table id="table" hidden style="width:100%;border-collapse:collapse;background:#fff;border-radius:12px;font-size:.85rem"><thead><tr>
<th>السؤال</th><th>المستوى</th><th>النوع</th><th>المصادر المقبولة</th><th>فتاوى/روابط</th><th>«ابحث واقرأ»</th><th>الزمن</th><th>امتنع؟</th><th>سبب الامتناع</th><th>المراحل</th><th>التصنيف</th><th>السريعة</th><th>الويب</th><th>الترتيب</th><th>أول كلمة</th><th>الصياغة</th><th>فحص الشخصية</th><th>اكتمال</th><th>زمن كل مصدر سريع</th></tr></thead><tbody></tbody></table>
<p class="note">الأعمدة الزمنية (R5): التصنيف، والمصادر السريعة، و«ابحث واقرأ» (إن انتُظرت)، والترتيب بالنموذج («تُخطّي» إن كفت المطابقة الواضحة)، وأول كلمة من الجواب من بداية السؤال (الهدف ≈ 8 ث)، والصياغة كاملة. الزمن الكلي أحمر فوق 25 ث. «فحص الشخصية»: غياب «تذكر المصادر» و«أكثر من صياغة» وأخواتهما من الجواب كاملاً. «اكتمال» (R5b): نسبة عناصر قائمة السؤال العملي في الجواب (الهدف 90% لسؤالي الصلاة والوضوء)، والناقص في التلميح. «زمن كل مصدر سريع»: من بداية الاسترجاع حتى اكتماله، و«—» لما لم يُنتظر (قُطع)، والأبطأ أولاً.</p>
</details>
<textarea id="question" placeholder="السؤال"></textarea>
<button id="run">شغّل الفحص</button>
<div id="q" hidden></div>
<div id="out"></div>
<script>
const SOURCES=${sourcesJson};
const SUITE=[
["عقيدة","ما معنى الإيمان بالقدر خيره وشره؟"],
["معاملات","ما حكم بيع التقسيط بزيادة في الثمن؟"],
["أسرة","ما حقوق الزوجة على زوجها في الإسلام؟"],
["سيرة","متى كانت غزوة بدر ولماذا وقعت؟"],
["مسلم جديد","أسلمت حديثاً، كيف أتعلم الوضوء والصلاة؟"],
["غير مسلم","I'm not a Muslim. Why do Muslims fast during Ramadan?"],
["إنجليزي","What does the Quran say about kindness to parents?"],
["تركي","Namazın şartları nelerdir?"],
["فرنسي","Pourquoi les musulmans prient-ils cinq fois par jour ?"],
["نادر","من هو الصحابي الذي اهتز لموته عرش الرحمن؟"],
["عبادات","ما حكم الصلاة في الطائرة؟"],
["معاملات (إنجليزي)","What is the ruling on mortgages?"],
["صيام (تركي)","Oruç tutarken diş fırçalamak orucu bozar mı?"],
["عقيدة","من هم أولو العزم من الرسل؟"],
["أسماء الله","ما معنى اسم الله الصمد؟"],
["المرشد","كيف أتوضأ خطوة بخطوة؟","new_muslim"],
["المرشد","كيف أصلي خطوة بخطوة؟","new_muslim"],
["المرشد","ما معنى الشهادتين؟","new_muslim"],
["المرشد (إنجليزي)","My parents are Christian. How should I treat them now that I am Muslim?","new_muslim"],
["الداعية (إنجليزي)","What do Muslims believe about God?","discover"],
["الداعية · شبهة","هل انتشر الإسلام بالسيف؟","discover"],
["الداعية · شبهة (إنجليزي)","Why do Muslims worship the Kaaba?","discover"]];
const tag=(c,m)=>c+(m?" ["+m+"]":"");
SUITE.forEach(([c,q,m])=>{const li=document.createElement("li");li.textContent=tag(c,m)+": "+q;document.getElementById("suite").appendChild(li)});
document.getElementById("runAll").onclick=async()=>{const b=document.getElementById("runAll");b.disabled=true;
const t=document.getElementById("table");t.hidden=false;const tb=t.querySelector("tbody");tb.innerHTML="";
const rows=SUITE.map(([c,q,m])=>{const tr=document.createElement("tr");[tag(c,m)+": "+q,"…","","","","","","","","","","","","","","","","",""].forEach(x=>{const td=document.createElement("td");td.textContent=x;tr.appendChild(td)});tb.appendChild(tr);return tr});
let next=0;async function w(){while(next<SUITE.length){const i=next++;const [c,q,m]=SUITE[i];const tds=rows[i].children;
try{const j=await post(m?{action:"full",question:q,mode:m}:{action:"full",question:q});
if(j.error){tds[1].textContent="خطأ";tds[7].textContent=j.error;continue}
tds[1].textContent=j.level??"—";tds[2].textContent=j.kind+(j.overrides&&j.overrides.length?" ("+j.overrides.join("، ")+")":"");tds[3].textContent=String(j.accepted)+(j.sources&&j.sources.length?" ("+j.sources.join("، ")+")":"");
tds[4].textContent=j.fatwas+" / "+j.links;tds[5].textContent=j.web?(j.web.verified+" بنص · "+j.web.linkOnly+" رابط"+(j.web.searchOnly?" (بحث فقط)":"")+" · "+j.web.ms+"ms"+(j.web.error?" · "+j.web.error:"")):"—";
tds[6].textContent=(j.ms/1000).toFixed(1)+" ث"+(j.timings&&j.timings.cached?" (ذاكرة)":"");tds[6].style.color=j.ms>25000?"var(--bad)":"var(--mid)";tds[7].textContent=j.abstained?"نعم":"لا";tds[7].style.color=j.abstained?"var(--bad)":"var(--mid)";tds[0].title=j.text||"";
const RS={no_passages:"لا نصوص من البحث",no_relevant:"لا نص بلغ 60",model_abstained:"النموذج امتنع رغم النصوص",no_citation:"جواب فارغ",guard:"اعتراض الحارس"};
tds[8].textContent=j.abstainReason?(RS[j.abstainReason]||j.abstainReason)+(j.attempts&&j.attempts.length?" · محاولات: "+j.attempts.length:""):"—";
tds[8].title=(j.attempts||[]).map((a,i)=>(i+1)+") "+(a.findings.join("، ")||"—")+" ← "+a.head).join("\\n");
const sec=(x)=>x==null?"—":(x/1000).toFixed(1)+"ث";const t=j.timings||{},st=j.stages;
tds[9].textContent="تصنيف "+sec(t.classifyMs)+" · بحث "+sec(t.searchMs)+(st?" (سريعة "+sec(st.fastMs)+" · تقييم "+sec(st.rerank1Ms)+(st.earlyExit?" · اكتفى بالسريعة":" · انتظار «ابحث واقرأ» "+sec(st.waitMs)+" · تقييم 2 "+sec(st.rerank2Ms))+(st.webInRound1?" · الطبقة في الأولى":"")+(st.laterMs?" · إعادة تخطيط "+sec(st.laterMs):"")+")":"")+" · صياغة "+sec(t.generateMs)+(j.web&&j.web.jsonRecovery?" · JSON: "+j.web.jsonRecovery:"");
tds[10].textContent=sec(t.classifyMs);tds[11].textContent=sec(t.fastMs)+(st&&st.prefetched?" (مسبق)":"");tds[12].textContent=st&&st.earlyExit?"لم يُنتظر":sec(t.webMs);
tds[13].textContent=t.rerankSkipped?"تُخطّي ("+sec(t.rerankMs)+")":sec(t.rerankMs);tds[14].textContent=sec(t.firstTokenMs);tds[14].style.color=t.firstTokenMs>8000?"var(--bad)":"var(--mid)";tds[15].textContent=sec(t.generateMs);
const pc=j.persona||[];tds[16].textContent=j.kind!=="answer"?"—":pc.length?"✗ "+pc.join("، "):"✓";tds[16].style.color=pc.length?"var(--bad)":"var(--mid)";if(j.fixes&&j.fixes.length)tds[16].title="صُحح: "+j.fixes.join(" | ");
const ck=j.checklist;tds[17].textContent=ck?Math.round(ck.ratio*100)+"% ("+ck.id+")":"—";if(ck){tds[17].style.color=ck.ratio>=0.9?"var(--mid)":"var(--bad)";tds[17].title="الناقص: "+(ck.missing.join("، ")||"—")+"\\nوُجد له نص: "+(ck.found.join("، ")||"—")}
const fj=st&&st.fastJobs?Object.entries(st.fastJobs).sort((a,b)=>(b[1]??1e9)-(a[1]??1e9)):[];tds[18].textContent=fj.map(([k,v])=>k+" "+(v==null?"—":sec(v))).join(" · ")+(st&&st.enrichMs?" · إثراء "+sec(st.enrichMs):"")+(st&&st.webSkipped?" · الويب لم يُنتظر ("+(st.webSkipped==="pinned"?"آية/حديث مطابق":"كفت السريعة")+")":"")}
catch(e){tds[1].textContent="خطأ";tds[7].textContent=String(e)}}}
await Promise.all([w(),w()]);b.disabled=false};
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
if(j.web){const w=j.web;
box.append(el("div","note","عبارات البحث: "+((w.queries||[]).join(" · ")||"—")));
box.append(el("div","note","الصفحات المقروءة (المحتوى في الرد): "+((w.fetched||[]).map(f=>f.url+" ("+f.chars+" حرفاً)").join("، ")||"لا شيء — كل المصادر «رابط فقط»")));
box.append(el("div","note","التكلفة التقريبية: "+(w.costUsd==null?"—":"$"+Number(w.costUsd).toFixed(4))+(w.toolUse&&(w.toolUse.searches!=null||w.toolUse.fetches!=null)?" · بحث: "+(w.toolUse.searches??"—")+" · قراءة: "+(w.toolUse.fetches??"—"):"")));
if(w.error)box.append(el("div","note","الخطأ: "+w.error));
(w.sources||[]).forEach((x,i)=>{const d=el("div","res");
const st=el("span",x.status==="verified"?"ok-q":"bad-q",x.status==="verified"?({extracted:"فقرة من الصفحة (يقتطعها الكود)",snippet:"مقتطف من الصفحة (البحث)",near:"اقتباس شبه حرفي",exact:"اقتباس حرفي"}[x.match]||"نص موثَّق"):"رابط فقط ("+({no_content:"لا محتوى مقروء في الرد",not_found:"الاقتباس غير موجود في الصفحة",empty_quote:"بلا اقتباس"}[x.reason]||x.reason)+")");
const s=el("span","score "+(x.score>=60?"hi":"lo"),x.score==null?"—":String(x.score));
d.append(el("b","",(i+1)+". "),s,el("span",""," · "+x.title+" · "+x.site+" · "),st);
if(x.quote)d.append(el("div","quote",x.quote));
const a=el("a","",x.url);a.href=x.url;a.target="_blank";a.rel="noopener noreferrer";d.append(a);box.append(d)});
(w.dropped||[]).forEach(x=>box.append(el("div","note","محذوف ("+({domain:"خارج نطاقات المرجعية",invalid_url:"رابط غير صالح",duplicate:"مكرر"}[x.reason]||x.reason)+"): "+x.url)));
if(w.explanation)box.append(el("div","note","شرح النموذج (لا يُعرض للسائل): "+w.explanation))}
if(j.tools){j.tools.forEach(t=>{const det=el("details","");det.append(el("summary","",t.name+(t.description?" — "+t.description.slice(0,120):"")));det.append(el("pre","raw",JSON.stringify(t.inputSchema,null,2)));box.append(det)})}
(j.raw||[]).forEach(r=>{const det=el("details","");det.append(el("summary","","الرد الخام: "+r.path+(r.error?" — "+r.error:"")));det.append(el("pre","raw","المفاتيح: "+(r.keys||[]).join(", ")+"\\n\\n"+(r.head||"")));box.append(det)});
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
