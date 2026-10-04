import type { LlmHealth } from "@/lib/llm";
import type { McpHealth } from "@/lib/mcp";
import type { SiteDebug, SourceHealth } from "@/lib/sources";
import type { BayyinatCheck } from "@/lib/sources/bayyinat";

export type HealthReport = {
  generatedAt: string;
  llm: LlmHealth;
  usage: { used: number; limit: number; shared: boolean };
  mcp: McpHealth;
  sources: SourceHealth[];
  bayyinat: BayyinatCheck;
  /** اسم النموذج: للمشرف الأعلى فقط. */
  model: string | null;
  viewerIsAdmin: boolean;
  debug?: { id: string; page: SiteDebug }[];
};

const esc = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const STATUS: Record<string, { label: string; cls: string }> = {
  ok: { label: "يعمل", cls: "ok" },
  down: { label: "لا يعمل", cls: "down" },
  blocked: { label: "محجوب", cls: "blocked" },
  link_only: { label: "رابط فقط", cls: "link" },
};

const KIND: Record<string, string> = { mcp: "MCP", api: "API عام", site: "بحث في الموقع" };

function badge(status: string, extra = "") {
  const s = STATUS[status] ?? STATUS.down;
  return `<span class="badge ${s.cls}">${s.label}${extra}</span>`;
}

function yesNo(value: boolean | null) {
  if (value === null) return `<span class="muted">غير معروف</span>`;
  return value ? `<span class="badge ok">نعم</span>` : `<span class="badge down">لا</span>`;
}

/** صفحة /api/health: جداول عربية بهوية مستفتي (بلا أزرق). */
export function renderHealthPage(r: HealthReport): string {
  const counts = { ok: 0, down: 0, blocked: 0, link_only: 0 } as Record<string, number>;
  r.sources.forEach((s) => (counts[s.status] = (counts[s.status] ?? 0) + 1));

  const llmOk = r.llm.configured && r.llm.keyValid !== false && r.llm.modelAvailable !== false;
  const usagePct = Math.min(100, Math.round((r.usage.used / Math.max(1, r.usage.limit)) * 100));

  const sourceRows = r.sources
    .map((s) => {
      const methods = s.methods
        .map((m) => {
          const kind = s.access.length ? KIND[m.kind] : "فحص الوصول";
          const count = s.access.length ? ` · ${m.results} نتيجة${m.status === "ok" && m.results === 0 ? " ⚠" : ""}` : "";
          const err = m.error ? `<div class="err">${esc(m.error)}</div>` : "";
          const sample = m.sample
            ? `<div class="sample"><a href="${esc(m.sample.url)}" rel="noreferrer" target="_blank">${esc(m.sample.title)}</a>${
                m.sample.grade ? ` <span class="grade">${esc(m.sample.grade)}</span>` : ""
              }</div>`
            : "";
          return `<div class="method">${badge(m.status)} <b>${esc(kind)}</b> <span class="muted">${esc(m.via)} · ${m.latencyMs}ms${count}</span>${err}${sample}</div>`;
        })
        .join("");
      return `<tr>
        <td><a href="${esc(s.url)}" rel="noreferrer" target="_blank"><b>${esc(s.name)}</b></a><div class="muted ltr">${esc(s.url.replace(/^https?:\/\//, ""))}</div></td>
        <td>${esc(s.domain)}</td>
        <td>${s.access.length ? s.access.map((a) => esc(KIND[a])).join(" ← ") : `<span class="muted">رابط فقط</span>`}</td>
        <td>${badge(s.status)}</td>
        <td>${s.blocked ? `<div class="note"><b>لماذا رابط فقط:</b> ${esc(s.blocked)}</div>` : ""}${methods}${s.note ? `<div class="note">${esc(s.note)}</div>` : ""}</td>
        <td class="rule">${esc(s.rule)}</td>
      </tr>`;
    })
    .join("");

  const toolRows = r.mcp.tools
    .map((t) => {
      const props = Object.keys(t.inputSchema?.properties ?? {});
      const required = new Set(t.inputSchema?.required ?? []);
      const params = props.map((p) => `${esc(p)}${required.has(p) ? "*" : ""}`).join(", ");
      return `<tr><td class="ltr"><code>${esc(t.name)}</code></td><td class="ltr muted">${params || "—"}</td><td>${esc((t.description ?? "").slice(0, 220))}</td></tr>`;
    })
    .join("");

  const b = r.bayyinat;
  const bayyinat = `<h2>ملف «بيّنات» (dawa.center/file/7937): هل يمكن فهرسته محلياً؟</h2>
  <div class="card"><dl>
    <dt>صفحة الملف</dt><dd>${b.page === "allowed" ? `<span class="badge ok">مسموحة</span> ${esc(b.title ?? "")}` : `<span class="badge ${b.page === "blocked" ? "blocked" : "down"}">${b.page === "blocked" ? "ممنوعة" : "تعذّر الوصول"}</span> <span class="err">${esc(b.reason ?? "")}</span>`}</dd>
    <dt>روابط التنزيل</dt><dd>${
      b.files.length
        ? b.files
            .map((f) => `<div class="ltr"><code>${esc(f.url)}</code> — ${f.blocked ? `<span class="err">${esc(f.blocked)}</span>` : `${f.status ?? ""} · ${esc(f.type ?? "؟")} · ${f.bytes ? `${(f.bytes / 1048576).toFixed(1)} MB` : "الحجم غير معلن"}`}</div>`)
            .join("")
        : `<span class="muted">${b.page === "allowed" ? "لا روابط ملفات ظاهرة في الصفحة" : "—"}</span>`
    }</dd>
  </dl><p class="muted">فحص بطلب HEAD فقط، بلا تنزيل. الفهرسة نفسها لم تُنفَّذ.</p></div>`;

  const list = (items: string[] | undefined) => (items?.length ? items.map(esc).join("<br>") : `<span class="muted">—</span>`);
  const debug = r.debug?.length
    ? `<h2>تشخيص صفحات البحث (للمصادر التي لم تُرجع نتائج)</h2><div class="table-wrap"><table><thead><tr><th>المصدر</th><th>الصفحة</th><th>روابط بمعرّف رقمي</th><th>نماذج البحث وOpenSearch</th><th>روابط API في السكربتات</th></tr></thead><tbody>${r.debug
        .map(({ id, page: d }) => {
          const meta = d.error
            ? `<div class="err">${esc(d.error)}</div>`
            : `<div class="muted">${esc(d.title)} · ${d.bytes ?? 0} بايت · ${d.anchors ?? 0} رابطاً · __NEXT_DATA__: ${d.nextData ? "نعم" : "لا"} · JSON: ${d.jsonBlocks ?? 0}</div>`;
          const forms = [...(d.forms ?? []).map((f) => `${f.action} [${f.field}]`), ...(d.openSearch ? [`OpenSearch: ${d.openSearch}`] : [])];
          return `<tr><td>${esc(id)}</td><td class="ltr">${esc(d.url)}${meta}</td><td class="ltr"><code>${list(d.numericLinks)}</code></td><td class="ltr"><code>${list(forms)}</code></td><td class="ltr"><code>${list(d.apiHints)}</code></td></tr>`;
        })
        .join("")}</tbody></table></div>`
    : "";

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>حالة مُستفتي</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Readex+Pro:wght@400;600&display=swap" rel="stylesheet">
<style>
  :root { --green-900:#04301F; --green-600:#0A6B45; --gold:#FFB800; --ivory:#F5F3EA; --ink:#1d2a24; --muted:#5f6b64; --red:#9b2c1f; --amber:#8a5a00; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:"Readex Pro",system-ui,sans-serif; background:var(--ivory); color:var(--ink); line-height:1.6; }
  header { background:var(--green-900); color:var(--ivory); padding:20px 16px; }
  header h1 { margin:0; font-size:22px; } header p { margin:4px 0 0; opacity:.8; font-size:14px; }
  main { max-width:1400px; margin:0 auto; padding:16px; }
  h2 { color:var(--green-900); font-size:18px; margin:28px 0 10px; border-inline-start:4px solid var(--gold); padding-inline-start:10px; }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px; }
  .card { background:#fff; border-radius:14px; padding:14px 16px; box-shadow:0 1px 0 rgba(4,48,31,.08); }
  .card h3 { margin:0 0 8px; font-size:15px; color:var(--green-900); }
  .card dl { margin:0; display:grid; grid-template-columns:auto 1fr; gap:4px 12px; font-size:14px; }
  .card dt { color:var(--muted); }
  .bar { height:8px; background:#e8e4d6; border-radius:4px; overflow:hidden; margin-top:6px; } .bar span { display:block; height:100%; background:var(--green-600); }
  .table-wrap { overflow-x:auto; background:#fff; border-radius:14px; }
  table { width:100%; border-collapse:collapse; font-size:13.5px; }
  th { background:var(--green-900); color:var(--ivory); text-align:start; padding:10px; font-weight:600; position:sticky; top:0; }
  td { padding:10px; border-top:1px solid #ece8da; vertical-align:top; }
  tr:nth-child(even) td { background:#fbfaf5; }
  a { color:var(--green-600); text-decoration:none; } a:hover { text-decoration:underline; }
  .badge { display:inline-block; border-radius:999px; padding:1px 10px; font-size:12px; font-weight:600; white-space:nowrap; }
  .badge.ok { background:#dcefe5; color:var(--green-600); } .badge.down { background:#f6dfda; color:var(--red); }
  .badge.blocked { background:#fff0c7; color:var(--amber); } .badge.link { background:#ece8da; color:var(--muted); }
  .muted { color:var(--muted); font-size:12px; } .ltr { direction:ltr; text-align:left; unicode-bidi:plaintext; }
  .method { margin-bottom:6px; } .err { color:var(--red); font-size:12px; direction:ltr; text-align:left; }
  .sample { font-size:12px; } .grade { background:#fff0c7; color:var(--amber); border-radius:6px; padding:0 6px; }
  .note { font-size:12px; color:var(--muted); margin-top:4px; } .rule { font-size:12px; color:var(--muted); min-width:220px; }
  .summary { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
  code { font-size:12px; }
</style>
</head>
<body>
<header>
  <h1>حالة مُستفتي</h1>
  <p>فُحص من خادم المنصة في ${esc(new Date(r.generatedAt).toLocaleString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" }))} (توقيت الرياض) · يُحدَّث كل 5 دقائق · <a style="color:var(--gold)" href="?format=json">JSON</a></p>
</header>
<main>
  <div class="cards">
    <div class="card">
      <h3>النموذج اللغوي ${badge(llmOk ? "ok" : "down")}</h3>
      <dl>
        <dt>مضبوط</dt><dd>${yesNo(r.llm.configured)}</dd>
        <dt>المفتاح صالح</dt><dd>${yesNo(r.llm.keyValid)}</dd>
        <dt>النموذج متاح</dt><dd>${yesNo(r.llm.modelAvailable)}</dd>
        ${r.viewerIsAdmin ? `<dt>LLM_MODEL</dt><dd class="ltr"><code>${esc(r.model ?? "—")}</code></dd>` : ""}
        ${r.llm.latencyMs !== null ? `<dt>زمن الفحص</dt><dd>${r.llm.latencyMs}ms</dd>` : ""}
        ${r.llm.error ? `<dt>ملاحظة</dt><dd class="err">${esc(r.llm.error)}</dd>` : ""}
      </dl>
    </div>
    <div class="card">
      <h3>الحد اليومي</h3>
      <dl>
        <dt>استُعمل اليوم</dt><dd>${r.usage.used} من ${r.usage.limit}</dd>
        <dt>العدّاد</dt><dd>${r.usage.shared ? "مشترك (Supabase)" : "في ذاكرة الخادم"}</dd>
      </dl>
      <div class="bar"><span style="width:${usagePct}%"></span></div>
    </div>
    <div class="card">
      <h3>خادم MCP للجمعية ${badge(r.mcp.ok ? "ok" : "down")}</h3>
      <dl>
        <dt>العنوان</dt><dd class="ltr">${esc(r.mcp.url)}</dd>
        <dt>الأدوات</dt><dd>${r.mcp.tools.length}</dd>
        ${r.mcp.latencyMs !== null ? `<dt>الزمن</dt><dd>${r.mcp.latencyMs}ms</dd>` : ""}
        ${r.mcp.error ? `<dt>الخطأ</dt><dd class="err">${esc(r.mcp.error)}</dd>` : ""}
      </dl>
    </div>
    <div class="card">
      <h3>مصادر المرجعية (${r.sources.length})</h3>
      <div class="summary">${badge("ok", ` ${counts.ok}`)} ${badge("down", ` ${counts.down}`)} ${badge("blocked", ` ${counts.blocked}`)} ${badge("link_only", ` ${counts.link_only}`)}</div>
      <p class="muted">«رابط فقط»: مرجع يفتح ويُستشهد برابطه، بلا بحث آلي الآن.</p>
    </div>
  </div>

  <h2>المصادر: MCP أولاً، ثم API عام، ثم البحث المباشر (robots.txt، وطلب في الثانية، وذاكرة 24 ساعة)</h2>
  <div class="table-wrap"><table>
    <thead><tr><th>المصدر</th><th>المجال</th><th>طريقة الوصول</th><th>الحالة</th><th>نتيجة الفحص</th><th>قاعدة الاستخدام (المرجعية)</th></tr></thead>
    <tbody>${sourceRows}</tbody>
  </table></div>

  <h2>أدوات خادم MCP</h2>
  <div class="table-wrap"><table>
    <thead><tr><th>الأداة</th><th>المعطيات (* إلزامي)</th><th>الوصف</th></tr></thead>
    <tbody>${toolRows || `<tr><td colspan="3" class="muted">لا أدوات (الخادم لا يستجيب)</td></tr>`}</tbody>
  </table></div>
  ${bayyinat}
  ${debug}
</main>
</body>
</html>`;
}
