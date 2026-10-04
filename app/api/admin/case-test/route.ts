import { authzResponse, requireRole } from "@/lib/auth/roles";
import { guessLang } from "@/lib/brain/identity";
import { referralKindOf } from "@/lib/brain/heuristics";
import { newTrace, planClarify } from "@/lib/case/clarify";
import { isLlmConfigured } from "@/lib/llm";

/**
 * /api/admin/case-test — تشخيص محرك الاستيضاح بالنموذج الحقيقي على الموقع الحي.
 * للمشرف الأعلى فقط بعد MFA (مثل brain-test)، و404 لغيره.
 *   GET  ← صفحة تشغّل الأسئلة الثمانية (اثنان بالتوازي) وتعرض لكل سؤال: الباب المقترح والثقة، والقرار،
 *          والرد الخام، والأسئلة قبل الفحص وبعده مع سبب كل حذف، وهل استُعمل الاحتياطي ولماذا، والزمن.
 *   POST {i} أو {question} ← يشغّل سؤالاً واحداً ويعيد الخطة والسجل.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const QUESTIONS = [
  "ما حكم من يسرق وهو مضطر لأنه جوعان",
  "طلقت زوجتي وأنا غاضب، هل وقع؟",
  "ورث أبي بيتاً ولنا أخت متزوجة، كيف نقسمه؟",
  "أعمل في بنك ربوي في قسم تقنية المعلومات، هل راتبي حلال؟",
  "أسلمت حديثاً وأهلي يرفضون، هل أخبرهم؟",
  "What is the ruling on someone who steals because he is starving?",
  "نسيت صلاة الفجر ثلاثة أيام، ماذا أفعل؟",
  "Faizli kredi ile ev aldım, ne yapmalıyım?",
];

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
  return new Response(page(JSON.stringify(QUESTIONS).replace(/</g, "\\u003c")), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (!isLlmConfigured()) return Response.json({ error: "OPENROUTER_API_KEY / LLM_MODEL is not set" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { i?: unknown; question?: unknown } | null;
  const question =
    typeof body?.question === "string" && body.question.trim()
      ? body.question.trim().slice(0, 1000)
      : QUESTIONS[typeof body?.i === "number" ? body.i : -1];
  if (!question) return Response.json({ error: "unknown question" }, { status: 400 });

  const lang = guessLang(question);
  const kind = referralKindOf(question);
  const trace = newTrace();
  const started = Date.now();
  try {
    const plan = await planClarify({ question, lang, kind }, trace);
    return Response.json({ question, lang, kind, plan, trace, ms: Date.now() - started }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ question, lang, kind, trace, error: String((error as Error)?.message ?? error), ms: Date.now() - started });
  }
}

function page(questionsJson: string): string {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>تشخيص الاستيضاح</title>
<style>
:root{--deep:#04301F;--gold:#FFB800;--ivory:#F5F3EA;--mid:#0A6B45;--bad:#9B2C1F}
body{font-family:"Readex Pro",system-ui,sans-serif;background:var(--ivory);color:var(--deep);max-width:1000px;margin:0 auto;padding:16px;line-height:1.7}
h1{font-size:1.4rem;margin:.2em 0}
button{background:var(--gold);color:var(--deep);border:0;border-radius:999px;padding:10px 22px;font:inherit;font-weight:600;cursor:pointer}
button[disabled]{opacity:.6;cursor:default}
input{font:inherit;padding:8px 12px;border-radius:999px;border:1px solid #ccc;width:min(560px,100%)}
.case{background:#fff;border-radius:14px;padding:12px 14px;margin:10px 0;border-inline-start:6px solid #ccc}
.case.ok{border-color:var(--mid)}.case.fb{border-color:var(--bad)}.case.run{border-color:var(--gold)}
.q{font-weight:700;unicode-bidi:plaintext}
.meta{font-size:.85rem;opacity:.85}
.bad{color:var(--bad);font-weight:600}.good{color:var(--mid);font-weight:600}
ol{margin:.3em 0;padding-inline-start:1.4em}
li{unicode-bidi:plaintext}
.why{font-size:.8rem;opacity:.75}
pre{white-space:pre-wrap;direction:ltr;text-align:left;background:var(--ivory);border-radius:10px;padding:8px;font-size:.72rem;max-height:340px;overflow:auto}
details{font-size:.85rem;margin:4px 0}
</style></head><body>
<h1>تشخيص محرك الاستيضاح</h1>
<p>يشغّل المحرك الحقيقي بالنموذج الحقيقي (كل سؤال من 2 إلى 6 طلبات للنموذج، من الحد اليومي). لا يُحفظ شيء في الحالات.</p>
<button id="run">شغّل الأسئلة الثمانية</button> <button id="copy" disabled>انسخ التقرير</button>
<p><input id="custom" placeholder="أو جرّب سؤالاً آخر…"> <button id="one">شغّل</button></p>
<div id="out"></div>
<script>
const QUESTIONS = ${questionsJson};
const out = document.getElementById("out");
const results = [];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);
function render(box, r) {
  const t = r.trace || {};
  const ch = t.chapter || {};
  const gens = [...(t.generation || []).map((g) => ({ ...g, label: "جولة التوليد" })), ...(t.extras || []).map((g) => ({ ...g, label: "أسئلة خاصة بعد القالب" }))];
  const fb = Boolean(t.fallback) || Boolean(r.error);
  box.className = "case " + (fb ? "fb" : "ok");
  let h = '<div class="q">' + esc(r.question) + '</div>';
  h += '<div class="meta">اللغة: ' + esc(r.lang) + ' · النوع: ' + (r.kind === "ruling" ? "حكم عام" : "حالة شخصية") + ' · الزمن: ' + ((r.ms||0)/1000).toFixed(1) + ' ث</div>';
  h += '<div class="meta">الباب المقترح: <b>' + esc(ch.suggested ?? "—") + '</b> · الثقة: ' + (ch.confidence ?? "—") + ' · الباب النهائي: <b>' + esc(ch.final ?? "—") + '</b> (' + ((ch.ms||0)/1000).toFixed(1) + ' ث)' + (ch.error ? ' · <span class="bad">خطأ: ' + esc(ch.error) + '</span>' : '') + '</div>';
  h += '<div class="meta">القرار: <b>' + ({template:"قالب الباب",generated:"أسئلة مولّدة (حالة شخصية)",ruling:"أسئلة مولّدة (حكم عام)"}[t.decision] || "—") + '</b></div>';
  h += t.fallback ? '<div class="bad">الاحتياطي: ' + esc(t.fallback) + '</div>' : '<div class="good">بلا احتياطي</div>';
  if (r.error) h += '<div class="bad">خطأ: ' + esc(r.error) + '</div>';
  if (t.template) h += '<div class="meta">طلب القالب: ' + (t.template.ms/1000).toFixed(1) + ' ث' + (t.template.error ? ' · <span class="bad">' + esc(t.template.error) + '</span>' : '') + '</div>';
  gens.forEach((g, i) => {
    h += '<details open><summary>' + g.label + ' ' + (i+1) + ': ' + (g.ms/1000).toFixed(1) + ' ث · قبل الفحص ' + g.before.length + ' · بعده ' + g.kept + (g.error ? ' · <span class="bad">' + esc(g.error) + '</span>' : '') + '</summary>';
    if (g.before.length) h += '<div>قبل الفحص:</div><ol>' + g.before.map((q) => '<li>' + esc(q.ar) + ' <span class="meta">[' + esc(q.type) + (q.options.length ? ': ' + esc(q.options.join(" / ")) : '') + ']</span><div class="why">' + esc(q.why) + '</div></li>').join("") + '</ol>';
    if (g.dropped.length) h += '<div class="bad">المحذوف:</div><ol>' + g.dropped.map((d) => '<li>' + esc(d.ar) + ' ← <b>' + esc(d.reason) + '</b></li>').join("") + '</ol>';
    g.attempts.forEach((a, j) => { h += '<details><summary>الرد الخام ' + (j+1) + ' (' + (a.ms/1000).toFixed(1) + ' ث)' + (a.error ? ' · ' + esc(a.error) : '') + '</summary><pre>' + esc(a.raw || "(فارغ)") + '</pre></details>'; });
    h += '</details>';
  });
  const raws = [...(ch.attempts||[]), ...((t.template||{}).attempts||[])];
  if (raws.length) h += '<details><summary>ردود الباب والقالب الخام</summary>' + raws.map((a) => '<pre>' + esc(a.raw || a.error || "") + '</pre>').join("") + '</details>';
  if (t.known) h += '<div class="meta">المعلوم من النموذج: ' + esc(JSON.stringify(t.known.model)) + ' · من صيغة الفعل (الكود): ' + esc(JSON.stringify(t.known.code)) + '</div>';
  const qs = (r.plan && r.plan.questions) || [];
  h += '<div><b>الأسئلة المرشحة (' + qs.length + '؛ يُسأل منها 8 على الأكثر، والمشروط يظهر بحسب الأجوبة):</b></div><ol>' + qs.map((q) => '<li>' + esc(q.text) + (q.generated ? ' <span class="meta">(مولّد)</span>' : '') + (q.showIf ? ' <span class="meta">(مشروط: ' + esc(q.showIf.key) + (q.showIf.in ? ' ∈ ' + esc(q.showIf.in.join("/")) : '') + (q.showIf.notIn ? ' ∉ ' + esc(q.showIf.notIn.join("/")) : '') + ')</span>' : '') + (q.options.length ? ' <span class="meta">[' + esc(q.options.map((o) => o.label).join(" / ")) + ']</span>' : '') + '<div class="why">' + esc(q.why) + '</div></li>').join("") + '</ol>';
  if (r.plan && r.plan.known && r.plan.known.length) h += '<div class="meta">ما ذكره السائل: ' + esc(r.plan.known.map((k) => k.key + "=" + k.value).join("، ")) + '</div>';
  box.innerHTML = h;
}
async function runOne(body, box) {
  box.className = "case run"; box.innerHTML = '<div class="q">' + esc(body.question || QUESTIONS[body.i]) + '</div><div class="meta">يعمل…</div>';
  try {
    const res = await fetch(location.pathname, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const r = await res.json();
    if (!res.ok) throw new Error(r.error || res.status);
    results.push(r); render(box, r);
  } catch (e) { box.className = "case fb"; box.innerHTML += '<div class="bad">' + esc(e.message) + '</div>'; }
}
document.getElementById("run").onclick = async (e) => {
  e.target.disabled = true; out.innerHTML = ""; results.length = 0;
  const boxes = QUESTIONS.map(() => { const d = document.createElement("div"); out.appendChild(d); return d; });
  let next = 0;
  await Promise.all([0, 1].map(async () => { while (next < QUESTIONS.length) { const i = next++; await runOne({ i }, boxes[i]); } }));
  e.target.disabled = false; document.getElementById("copy").disabled = false;
};
document.getElementById("one").onclick = async () => {
  const q = document.getElementById("custom").value.trim(); if (!q) return;
  const d = document.createElement("div"); out.prepend(d); await runOne({ question: q }, d); document.getElementById("copy").disabled = false;
};
document.getElementById("copy").onclick = () => navigator.clipboard.writeText(JSON.stringify(results, null, 1));
</script></body></html>`;
}
