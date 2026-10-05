/**
 * طبقة «ابحث واقرأ» (R1b) بردود OpenRouter مسجّلة، بلا شبكة: فلتر النطاقات، وقراءة الجواب،
 * والمحتوى المقروء، والتحقق من الاقتباس، وشكل الطلب (الأدوات ومعطياتها)، والإطفاء، والفشل.
 * ومعها: تنظيف ترويسة MCP، وخيارات تفسير Quranpedia، وتصنيف المكتبة، ولا آية افتراضية في الفحص.
 *   npm test
 */
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import { WEB_ALLOWED_DOMAINS, WEB_FATWA_DOMAINS } from "../lib/sources/registry";
import { stripMcpChrome } from "../lib/sources/mcp-text";
import {
  extractFetched,
  locateVerbatim,
  matchQuote,
  searchOnlySources,
  parseWebAnswer,
  toolUsage,
  verifyWebAnswer,
  webDomainOf,
  type WebAnswer,
} from "../lib/brain/web-parse";

process.env.OPENROUTER_API_KEY = "test";
process.env.LLM_MODEL = "test-model";
process.env.MCP_URL = "http://127.0.0.1:9/mcp";
delete process.env.LLM_FALLBACK_MODEL;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

/** صفحة فتوى كما قد تعيدها أداة web_fetch (بالتشكيل وبمسافات مختلفة عن اقتباس النموذج). */
const PAGE = `السؤال: نمت عن صلاة الفجر ولم أستيقظ إلا بعد طلوع الشمس.
الجواب: الحمد لله.
مَن نامَ عن صلاةِ الفجرِ حتى طلعت الشمس   فإنه يصليها إذا استيقظ، لقول النبي ﷺ: «من نسي صلاة أو نام عنها فكفارتها أن يصليها إذا ذكرها».`;

const ANSWER: WebAnswer = {
  queries: ["قضاء صلاة الفجر", "النوم عن الصلاة"],
  sources: [
    { url: "https://islamqa.info/ar/answers/12345/", title: "قضاء صلاة الفجر", site: "IslamQA", quote: "من نام عن صلاة الفجر حتى طلعت الشمس فإنه يصليها إذا استيقظ" },
    { url: "https://ar.islamway.net/fatwa/1", title: "خارج المرجعية", site: "x", quote: "نص" },
    { url: "https://islamqa.info/ar/answers/12345", title: "مكرر", site: "x", quote: "نص" },
    { url: "https://binbaz.org.sa/fatwas/2233", title: "تأخير الصلاة", site: "x", quote: "لا يجوز تأخير الصلاة عن وقتها إلا لعذر" },
    { url: "https://hadeethenc.com/ar/browse/hadith/5", title: "حديث", site: "x", quote: "" },
    { url: "javascript:alert(1)", title: "x", site: "x", quote: "x" },
  ],
  explanation: "شرح",
};

const RAW = {
  id: "gen-1",
  choices: [
    {
      message: {
        role: "assistant",
        // الاقتباس في كلام النموذج نفسه لا يُعدّ محتوى مقروءاً (وإلا وثّق نفسه).
        content: JSON.stringify(ANSWER),
        reasoning: "سأقرأ https://binbaz.org.sa/fatwas/2233 وفيها: لا يجوز تأخير الصلاة عن وقتها إلا لعذر",
        annotations: [{ type: "url_citation", url_citation: { url: "https://www.islamqa.info/ar/answers/12345", title: "قضاء صلاة الفجر", content: PAGE } }],
        tool_calls: [{ function: { name: "web_fetch", arguments: JSON.stringify({ url: "https://binbaz.org.sa/fatwas/2233", content: "لا يجوز تأخير الصلاة عن وقتها إلا لعذر" }) } }],
      },
    },
    // رسالة أداة نصها JSON.
    { message: { role: "tool", content: JSON.stringify({ results: [{ url: "https://hadeethenc.com/ar/browse/hadith/5", text: "نص حديث طويل بما يكفي ليُعدّ محتوى مقروءاً" }] }) } },
  ],
  usage: { cost: 0.0123, server_tool_use: { web_search_requests: 2, web_fetch_requests: 3 } },
};

describe("فلتر النطاقات", () => {
  it("نطاقات المرجعية السبعة عشر ونطاقاتها الفرعية فقط", () => {
    assert.equal(WEB_ALLOWED_DOMAINS.length, 17);
    assert.equal(webDomainOf("https://www.islamqa.info/ar/answers/1"), "islamqa.info");
    assert.equal(webDomainOf("https://bohoth.awqaf.gov.kw/x"), "bohoth.awqaf.gov.kw");
    assert.equal(webDomainOf("http://shamela.ws/book/1"), "shamela.ws");
    for (const bad of ["https://ar.islamway.net/fatwa/1", "https://islamqa.info.evil.example/x", "https://awqaf.gov.kw/x", "ftp://islamqa.info/x", "islamqa.info/x", ""]) {
      assert.equal(webDomainOf(bad), null, bad);
    }
    assert.deepEqual([...WEB_FATWA_DOMAINS].slice(0, 3), ["islamqa.info", "binbaz.org.sa", "binothaimeen.net"]);
  });
});

describe("جواب النموذج", () => {
  it("JSON داخل كلام أو ```json، والحقول الناقصة لها قيم افتراضية", () => {
    assert.equal(parseWebAnswer("```json\n" + JSON.stringify(ANSWER) + "\n```")?.sources.length, 6);
    const partial = parseWebAnswer('هذه النتيجة: {"sources":[{"url":"https://dorar.net/x"}]} انتهى');
    assert.deepEqual(partial, { queries: [], sources: [{ url: "https://dorar.net/x", title: "", site: "", quote: "" }], explanation: "" });
    assert.equal(parseWebAnswer("لا أعرف"), null);
  });
});

describe("المحتوى المقروء في الرد الخام", () => {
  it("من annotations ورسائل الأدوات، لا من كلام النموذج وتفكيره وطلبات أدواته", () => {
    const pages = extractFetched(RAW);
    assert.deepEqual(pages.map((p) => p.url).sort(), ["https://hadeethenc.com/ar/browse/hadith/5", "https://www.islamqa.info/ar/answers/12345"]);
    assert.ok(!pages.some((p) => p.url.includes("binbaz")), "طلب الأداة وتفكير النموذج ليسا محتوى");
    assert.deepEqual(toolUsage(RAW), { searches: 2, fetches: 3 });
  });
});

describe("التحقق من الاقتباس", () => {
  it("حرفياً بعد تطبيع المسافات والتشكيل، ويعود بنص الصفحة نفسه", () => {
    const exact = locateVerbatim("من نام عن صلاة الفجر حتى طلعت الشمس فإنه يصليها", PAGE);
    assert.equal(exact, "مَن نامَ عن صلاةِ الفجرِ حتى طلعت الشمس   فإنه يصليها");
  });
  it("كلمة مختلفة أو اقتباس قصير جداً ← غير موجود", () => {
    assert.equal(locateVerbatim("من نام عن صلاة العشاء حتى طلعت الشمس", PAGE), null);
    assert.equal(locateVerbatim("الحمد لله", PAGE), null);
  });

  it("verifyWebAnswer: الموثَّق، و«رابط فقط» بأسبابه، والمحذوف بأسبابه، واسم الموقع من النطاق", () => {
    const { sources, dropped } = verifyWebAnswer(ANSWER, extractFetched(RAW));
    assert.deepEqual(
      sources.map((s) => `${s.domain}:${s.status}:${s.reason ?? ""}`),
      // R1d: نتيجة الأداة القصيرة مقتطف من الصفحة (نص حرفي) بدل «رابط فقط».
      ["islamqa.info:verified:", "binbaz.org.sa:link_only:no_content", "hadeethenc.com:verified:"],
    );
    assert.equal(sources[2].snippet, true);
    assert.equal(sources[2].match, "snippet");
    assert.equal(sources[2].quote, "نص حديث طويل بما يكفي ليُعدّ محتوى مقروءاً");
    assert.equal(sources[0].site, "الإسلام سؤال وجواب");
    assert.match(sources[0].quote!, /^مَن نامَ عن صلاةِ الفجرِ/);
    assert.equal(sources[1].quote, undefined);
    assert.deepEqual(
      dropped.map((d) => d.reason),
      ["domain", "duplicate", "invalid_url"],
    );
  });

  it("اقتباس النموذج غير موجود في الصفحة ← لا يُعرض أبداً؛ النص من الصفحة نفسها (مقتطف) بدله", () => {
    const { sources } = verifyWebAnswer(
      { queries: [], explanation: "", sources: [{ url: "https://islamqa.info/ar/answers/12345", title: "t", site: "", quote: "يجب عليك قضاؤها فوراً دون تأخير ولا عذر" }] },
      extractFetched(RAW),
    );
    assert.equal(sources[0].status, "verified");
    assert.equal(sources[0].match, "snippet");
    assert.ok(!sources[0].quote!.includes("فوراً دون تأخير"));
    assert.ok(PAGE.replace(/\s+/g, " ").includes(sources[0].quote!));
  });
});

// ---------------------------------------------------------------------------
// webSearchRead: شكل الطلب، والإطفاء، والفشل
// ---------------------------------------------------------------------------

const sent: { body: Record<string, unknown> }[] = [];
let mode: "ok" | "fail" = "ok";
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes("openrouter.ai")) {
    sent.push({ body: JSON.parse(String(init?.body ?? "{}")) });
    if (mode === "fail") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(RAW), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  throw new TypeError("fetch failed");
}) as typeof fetch;

let web: typeof import("../lib/brain/web");
let probe: typeof import("../lib/sources/probe");
before(async () => {
  web = await import("../lib/brain/web");
  probe = await import("../lib/sources/probe");
});

describe("webSearchRead", () => {
  it("الأداتان بمعطياتهما: exa، ونطاقات المرجعية، وmax_uses 2، وmax_content_tokens 6000 (R1c)", async () => {
    sent.length = 0;
    const r = await web.webSearchRead("ما حكم قضاء صلاة الفجر بعد طلوع الشمس؟", { lang: "ar", phrases: ["قضاء الفجر"] });
    const tools = sent[0].body.tools as { type: string; parameters: Record<string, unknown> }[];
    assert.deepEqual(tools[0], { type: "openrouter:web_search", parameters: { engine: "exa", allowed_domains: [...WEB_ALLOWED_DOMAINS] } });
    assert.deepEqual(tools[1], {
      type: "openrouter:web_fetch",
      parameters: { engine: "exa", max_uses: 2, max_content_tokens: 6000, allowed_domains: [...WEB_ALLOWED_DOMAINS] },
    });
    assert.equal(sent[0].body.response_format, undefined);
    assert.equal(r.ok, true);
    assert.equal(r.sources.filter((s) => s.status === "verified").length, 1);
    assert.equal(r.costUsd, 0.0123);
    assert.deepEqual(r.toolUse, { searches: 2, fetches: 3 });
    assert.ok(r.fetched.length === 2);
  });

  it("الحالة D: البحث في مواقع الفتاوى أولاً، وتعليمات «فتاوى منشورة مشابهة»", async () => {
    sent.length = 0;
    await web.webSearchRead("طلقت زوجتي وأنا غاضب", { mode: "case" });
    const tools = sent[0].body.tools as { parameters: { allowed_domains: string[] } }[];
    assert.deepEqual(tools[0].parameters.allowed_domains, [...WEB_FATWA_DOMAINS]);
    const system = (sent[0].body.messages as { role: string; content: string }[])[0].content;
    assert.match(system, /CASE MODE/);
    assert.match(system, /مُستفتي|Mustafti/);
  });

  it("FEATURE_WEB_TOOLS=false يطفئها بلا طلب، والفشل لا يرمي", async () => {
    sent.length = 0;
    process.env.FEATURE_WEB_TOOLS = "false";
    const off = await web.webSearchRead("سؤال");
    assert.equal(off.ok, false);
    assert.equal(off.error, "disabled");
    assert.equal(sent.length, 0);
    delete process.env.FEATURE_WEB_TOOLS;
    mode = "fail";
    const failed = await web.webSearchRead("سؤال");
    mode = "ok";
    assert.equal(failed.ok, false);
    assert.deepEqual(failed.sources, []);
    assert.ok(failed.error);
  });
});

// ---------------------------------------------------------------------------
describe("ترويسة MCP التقنية لا تُعرض", () => {
  const RAW_TEXT = [
    "──────── RETRIEVED FROM QURANENC — published text ────────",
    '[Surah 2, translation "arabic_moyassar"]',
    "[EXACT] the verse itself — reproduce these words exactly",
    "[2:127]",
    "وَإِذۡ يَرۡفَعُ إِبۡرَٰهِـۧمُ ٱلۡقَوَاعِدَ",
    "[/EXACT]",
    "Source: https://islamenc.com/ar/quran/2/127",
    "──────── CITE ────────",
    "Every result you carry into your reply must bring the URL",
  ].join("\n");

  it("بأسطرها", () => {
    const out = stripMcpChrome(RAW_TEXT);
    assert.doesNotMatch(out, /RETRIEVED|reproduce|EXACT|CITE|Every result|\[Surah|Source:/);
    assert.match(out, /وَإِذۡ يَرۡفَعُ/);
    assert.match(out, /\[2:127\]/, "مرجع الآية يبقى لتحليل النص");
  });

  it("وبعد دمجها سطراً واحداً (كما في نتائج البحث)", () => {
    const out = stripMcpChrome(RAW_TEXT.replace(/\n/g, " "));
    assert.doesNotMatch(out, /RETRIEVED|reproduce|EXACT|CITE|Every result|\[Surah|Source:/);
    assert.match(out, /وَإِذۡ يَرۡفَعُ/);
    assert.equal(stripMcpChrome("RETRIEVED FROM HADEETHENC — published text إنما الأعمال بالنيات"), "إنما الأعمال بالنيات");
  });
});

describe("صفحة الفحص: لا آية افتراضية", () => {
  it("get_quran_verses وتفسير Quranpedia وترجمته لا تُستدعى بلا مرجع آية في السؤال", async () => {
    for (const id of ["mcp_verses", "qp_tafsir", "qp_translation"] as const) {
      const out = await probe.runProbeSource(id, "ما فضل الصدقة؟", [], "ar", null, async () => []);
      assert.equal(out.skipped, true, id);
      assert.deepEqual(out.results, []);
    }
  });
});

describe("التحقق الموسَّع من الاقتباس (R1c)", () => {
  const TAFSIR = `﴿اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ﴾ [البقرة: 255]. قال ابنُ باز رحمه الله: هذه الآيةُ أعظمُ آيةٍ في كتاب الله، لما اشتملت عليه من أسماء الله وصفاته، والدلالة على توحيده سبحانه.`;

  it("الترقيم العربي واللاتيني، والأقواس القرآنية، والهمزات، والتشكيل، والمسافات لا تمنع المطابقة الحرفية", () => {
    const verse = matchQuote("«الله لا اله الا هو، الحي القيوم»", TAFSIR);
    assert.equal(verse.match, "exact");
    assert.equal(verse.text, "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ");
    const m = matchQuote("قال ابن باز - رحمه الله - : هذه الايه اعظم ايه في كتاب الله", TAFSIR);
    assert.equal(m.match, "exact");
    assert.equal(m.text, "قال ابنُ باز رحمه الله: هذه الآيةُ أعظمُ آيةٍ في كتاب الله");
  });

  it("90% من الكلمات متتابعة ← مقبول شبه حرفي بنص الصفحة؛ وأقل ← مرفوض بنسبته", () => {
    const quote = "هذه الآية أعظم آية في كتاب الله لما اشتملت عليه من أسماء الله وصفاته والدلالة على توحيده تعالى";
    const near = matchQuote(quote, TAFSIR); // «سبحانه» صارت «تعالى»: كلمة من 19 (95%)
    assert.equal(matchQuote("هذه الآية أعظم آية في كتاب الله لما اشتملت عليه من أسماء الله وصفاته والدلالة على توحيد الله سبحانه", TAFSIR).text, null, "كلمتان من 19 (89%) ← مرفوض");
    assert.equal(near.match, "near");
    assert.ok(near.ratio >= 0.9, String(near.ratio));
    assert.match(near.text!, /^هذه الآيةُ أعظمُ آيةٍ/);
    const far = matchQuote("هذه الآية أعظم سورة في القرآن لما فيها من الأحكام والقصص والأمثال الكثيرة", TAFSIR);
    assert.equal(far.text, null);
    assert.ok(far.ratio < 0.9);
  });

  it("سبب الرفض ونسبته في المصدر", () => {
    const { sources } = verifyWebAnswer(
      { queries: [], explanation: "", sources: [{ url: "https://binbaz.org.sa/fatwas/1", title: "t", site: "", quote: "هذه الآية أعظم سورة في القرآن لما فيها من الأحكام والقصص" }] },
      // صفحة مقروءة بلا كلمات سؤال للاقتطاع: يبقى اقتباس النموذج وحده، ويُرفض.
      [{ url: "https://binbaz.org.sa/fatwas/1", content: TAFSIR, kind: "page" }],
    );
    assert.equal(sources[0].status, "link_only");
    assert.equal(sources[0].reason, "not_found");
    assert.equal(typeof sources[0].ratio, "number");
  });
});

describe("احتياط البحث وحده: «رابط فقط» بدل الصفر (R1c)", () => {
  it("من روابط النموذج ثم من نتائج أداة البحث، في نطاقات المرجعية فقط", () => {
    const out = searchOnlySources(
      { queries: [], explanation: "", sources: [{ url: "https://islamqa.info/ar/answers/1", title: "فتوى", site: "", quote: "" }, { url: "https://evil.example/x", title: "x", site: "", quote: "" }] },
      [{ url: "https://dorar.net/hadith/sharh/1", title: "حديث", content: "مقتطف من نتيجة البحث بما يكفي من الحروف" }],
    );
    // R1d: مقتطف البحث نص حرفي من الصفحة («مقتطف من الصفحة») ويُقدَّم؛ «رابط فقط» لما لا نص له.
    assert.deepEqual(out.map((x) => `${x.domain}:${x.status}:${x.reason ?? x.match}`), ["dorar.net:verified:snippet", "islamqa.info:link_only:search_only"]);
    assert.equal(out[0].quote, "مقتطف من نتيجة البحث بما يكفي من الحروف");
  });

  it("webLayer: القراءة تتأخر ← البحث السريع يبدأ ويُعرض «رابطاً فقط»، والقراءة إن جاءت بمصادر تُقدَّم", async () => {
    const empty = { ok: false, queries: [], sources: [], dropped: [], fetched: [], explanation: "", ms: 0, costUsd: null, toolUse: {} };
    const link = { ...empty, ok: true, searchOnly: true, sources: [{ url: "https://islamqa.info/ar/answers/9", title: "ف", site: "الإسلام سؤال وجواب", domain: "islamqa.info" as const, status: "link_only" as const, reason: "search_only" as const }] };
    const slowRead = () => new Promise<typeof empty>((r) => setTimeout(() => r(empty), 60_000));
    let searched = 0;
    const t0 = Date.now();
    // المهلة 12 ث: البحث السريع يبدأ عند منتصفها، وتُنتظر القراءة حتى نهايتها، ثم نتائج البحث.
    const r = await web.webLayer("سؤال", { timeoutMs: 12_000 }, { read: slowRead as never, search: (async () => { searched++; return link; }) as never });
    assert.equal(searched, 1);
    assert.equal(r.sources[0].reason, "search_only");
    assert.ok(Date.now() - t0 < 13_500, `${Date.now() - t0}ms`);
    const verified = { ...empty, ok: true, sources: [{ ...link.sources[0], status: "verified" as const, quote: "نص", reason: undefined }] };
    const fast = await web.webLayer("سؤال", { timeoutMs: 12_000 }, { read: (async () => verified) as never, search: (async () => { searched++; return link; }) as never });
    assert.equal(fast.sources[0].status, "verified");
    assert.equal(searched, 1, "لا بحث سريع إن جاءت القراءة بمصادر");
  });
});
