/**
 * الفتاوى المنشورة في الرد كاملاً (respond) بلا شبكة: النموذج وQuranpedia والدرر مستبدلة بـ fetch وهمي.
 *  - الحالة الشخصية D: بطاقات فتاوى قريبة للاطلاع (مقتطف حرفي، والمفتي، والرابط)، ثم سطر الإحالة.
 *  - A/B/C: «فتاوى منشورة ذات صلة» مع الجواب.
 *  - لا امتناع جاف: النصوص القريبة وأسئلة قريبة يمكن الجواب عنها.
 *  - الأمان: لا حكم في كلام الأداة أبداً، والحارس على كلام الأداة وحده لا على النص المنقول.
 *   npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";

process.env.OPENROUTER_API_KEY = "test";
process.env.LLM_MODEL = "test-model";
process.env.MCP_URL = "http://127.0.0.1:9/mcp";
delete process.env.LLM_FALLBACK_MODEL;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

type Cls = { level: "A" | "B" | "C" | "D"; ar: string[]; chapter?: string | null };
/** تصنيف كل سؤال، ودرجة كل نص (بنمط في نصه)، والجواب المولّد. */
const CLASS: Record<string, Cls> = {};
let scoreOf: (question: string, block: string) => number = () => 0;
let answerText = "";
let suggestions: { q: string; id: string }[] = [];
const llmCalls: string[] = [];
/** تعليمات آخر طلب صياغة، وتعطيل تقييم الصلة (لاختبار الاحتياط بلا نموذج). */
let lastChatSystem = "";
let relevanceFails = false;
/** رد طبقة «ابحث واقرأ» (طلب فيه tools): الافتراضي لا مصادر. */
let webReply: unknown = { choices: [{ message: { role: "assistant", content: '{"queries":[],"sources":[],"explanation":""}' } }], usage: {} };
const webRequests: { tools: { type: string; parameters?: Record<string, unknown> }[]; system: string }[] = [];

const reply = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }], usage: {} }), { status: 200, headers: { "Content-Type": "application/json" } });

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes("openrouter.ai")) {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const name: string | undefined = body.response_format?.json_schema?.name;
    const msgs = body.messages as { role: string; content: string }[];
    const user = [...msgs].reverse().find((m) => m.role === "user")?.content ?? "";
    if (Array.isArray(body.tools)) {
      llmCalls.push("web");
      webRequests.push({ tools: body.tools, system: msgs.find((m) => m.role === "system")?.content ?? "" });
      return new Response(JSON.stringify(webReply), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    llmCalls.push(name ?? "chat");
    if (name === "classification") {
      const c = CLASS[user.trim()] ?? { level: "A", ar: [] };
      return reply(
        JSON.stringify({
          lang: "ar",
          userType: "muslim",
          level: c.level,
          urgent: false,
          outOfScope: false,
          aboutMustafti: false,
          chapter: c.chapter ?? null,
          needsClarification: false,
          misconception: null,
          searchQueries: { ar: c.ar, userLang: [] },
        }),
      );
    }
    if (name === "citation_plan") {
      return reply(JSON.stringify({ quran: [], surah_info: [], quran_index: false, quran_queries: [], hadith_queries: [], bayyinat_queries: [] }));
    }
    if (name === "relevance" && relevanceFails) return new Response("upstream error", { status: 500 });
    if (name === "relevance") {
      const question = user.match(/QUESTION: """([\s\S]*?)"""/)?.[1] ?? "";
      const blocks = user.split(/\n\n(?=\[S\d+\])/);
      const scores = blocks.flatMap((b) => {
        const id = b.match(/\[(S\d+)\]/)?.[1];
        return id ? [{ id, score: scoreOf(question, b) }] : [];
      });
      return reply(JSON.stringify({ scores }));
    }
    if (name === "suggestions") return reply(JSON.stringify({ questions: suggestions }));
    lastChatSystem = msgs.find((m) => m.role === "system")?.content ?? "";
    return reply(answerText);
  }
  const u = new URL(url);
  const json = (s: string) => new Response(s, { status: 200, headers: { "Content-Type": "application/json" } });
  if (u.hostname === "api.quranpedia.net") {
    const path = decodeURIComponent(u.pathname);
    if (path.endsWith("/fatwas")) return json(path.includes("طلاق") ? fixture("quranpedia-divorce.json") : fixture("quranpedia-fatwas.json"));
    return json("{}");
  }
  if (u.hostname === "dorar.net") return json(fixture("dorar.json"));
  throw new TypeError("fetch failed"); // MCP وغيره: لا شبكة
}) as typeof fetch;

/** رد OpenRouter مسجَّل لطبقة «ابحث واقرأ»: الجواب JSON، والمحتوى المقروء في annotations. */
function webResponse(sources: { url: string; title: string; quote: string; page?: string }[]) {
  return {
    choices: [
      {
        message: {
          role: "assistant",
          content: JSON.stringify({
            queries: ["عبارة"],
            sources: sources.map(({ url, title, quote }) => ({ url, title, site: "x", quote })),
            explanation: "",
          }),
          annotations: sources
            .filter((x) => x.page)
            .map((x) => ({ type: "url_citation", url_citation: { url: x.url, title: x.title, content: x.page } })),
        },
      },
    ],
    usage: { cost: 0.004, server_tool_use: { web_search_requests: 1, web_fetch_requests: sources.length } },
  };
}

let brain: typeof import("../lib/brain/respond");
let messages: typeof import("../lib/brain/messages");
before(async () => {
  brain = await import("../lib/brain/respond");
  messages = await import("../lib/brain/messages");
});

const DIVORCE = JSON.parse(fixture("quranpedia-divorce.json")) as { ar_answer: string; ar_source_url: string }[];

describe("الحالة الشخصية D: فتاوى منشورة للاطلاع ثم الإحالة", () => {
  it("فتوى قريبة (≥ 60): سطر الأداة الثابت، وبطاقة بمقتطف حرفي ومفتٍ ورابط، ثم «الأفضل لحالتك أن يراها مختص»", async () => {
    const q = "طلقت زوجتي وأنا غاضب جداً، فهل وقع طلاقي؟";
    CLASS[q] = { level: "D", ar: ["طلاق الغضبان", "الطلاق في الغضب"], chapter: "talaq_khul" };
    scoreOf = (_q, b) => (/غضب شديد|حالة غضب/.test(b) ? 88 : 30);
    const r = await brain.respond(q);
    assert.equal(r.kind, "referral");
    assert.equal(r.text, messages.message("fatwasFound", "ar"));
    assert.equal(r.text, "وجدت فتاوى منشورة قريبة من سؤالك، للاطلاع فقط، وقد لا تطابق حالتك في كل تفاصيلها.");
    assert.equal(r.note, "الأفضل لحالتك أن يراها مختص.");
    assert.equal(r.fatwas?.length, 1);
    const card = r.fatwas![0];
    assert.equal(card.url, DIVORCE[0].ar_source_url);
    assert.equal(card.mufti, "الإسلام سؤال وجواب");
    assert.equal(card.title, "طلاق الغضبان");
    assert.ok(card.excerpt.length <= 401);
    assert.ok(DIVORCE[0].ar_answer.startsWith(card.excerpt.replace(/…$/, "")), "مقتطف حرفي من أول الجواب");
    // النص المنقول فيه عبارات حكم («يقع معه الطلاق»)، وكلام الأداة سليم: الحارس على كلام الأداة وحده.
    assert.match(card.excerpt, /يقع معه الطلاق/);
    assert.deepEqual(brain.finalCheck(r, q).findings, []);
    assert.equal(r.passages.length, 0, "لا نصوص للصياغة في D: الأداة لا تلخّص ولا تطبّق");
    assert.ok(!llmCalls.includes("chat"), "لا صياغة من النموذج في D");
  });

  it("لا فتوى بلغت 60: الإحالة كما كانت بلا بطاقات", async () => {
    const q = "حلفت بالطلاق ألا أدخل البيت ثم دخلته وأنا غاضب، فما الذي علي؟";
    CLASS[q] = { level: "D", ar: ["الحلف بالطلاق"] };
    scoreOf = () => 40;
    const r = await brain.respond(q);
    assert.equal(r.kind, "referral");
    assert.equal(r.fatwas, undefined);
    assert.equal(r.note, undefined);
    assert.equal(r.text, messages.message("referral", "ar"));
  });
});

describe("A/B/C: «فتاوى منشورة ذات صلة» مع الجواب", () => {
  it("الفتاوى ≥ 60 بطاقاتٌ (حتى 3)، وما دون 60 أو من خارج المرجعية لا يظهر", async () => {
    const q = "ما الذي يفعله من نام عن صلاة الفجر حتى طلعت الشمس؟";
    CLASS[q] = { level: "A", ar: ["قضاء صلاة الفجر", "النوم عن الصلاة"] };
    scoreOf = (_q, b) => (/من نام عن صلاة الفجر حتى طلعت/.test(b) ? 92 : /تأخير الصلاة عن وقتها/.test(b) ? 66 : /وقت صلاة الفجر من طلوع/.test(b) ? 30 : 5);
    answerText = "من نام عن صلاة الفجر حتى طلعت الشمس يصليها إذا استيقظ ويبادر بها [1].";
    const r = await brain.respond(q);
    assert.equal(r.kind, "answer", r.text);
    assert.deepEqual(
      r.fatwas?.map((f) => f.url),
      ["https://islamqa.info/ar/answers/12345", "https://binbaz.org.sa/fatwas/2233/حكم-تاخير-الصلاة"],
    );
    assert.ok(r.fatwas!.every((f) => f.excerpt && f.mufti && f.title));
    assert.ok(r.passages.length >= 1 && r.passages.filter((p) => /^فتوى منشورة/.test(p.source)).length <= 2);
    assert.deepEqual(brain.finalCheck(r, q).findings, []);
  });
});

describe("لا امتناع جاف", () => {
  it("لا نص بلغ 60: «لم أجد جواباً كافياً» مع النصوص القريبة، وأسئلة قريبة سليمة فقط", async () => {
    const q = "ما فضل النية في الأعمال؟";
    CLASS[q] = { level: "A", ar: ["النية في الأعمال"] };
    scoreOf = (_q, b) => (/إنما الأعمال/.test(b) ? 50 : 10);
    // R5c: بلا نص بلغ 60 يُطلب الجواب من علم المساعد؛ هنا امتنع النموذج رغم الإعادة.
    answerText = "لم أجد جواباً كافياً في المصادر المعتمدة.";
    // «ابحث واقرأ» قرأت صفحة الحديث، والاقتباس موجود فيها حرفياً.
    webReply = webResponse([
      {
        url: "https://hadeethenc.com/ar/browse/hadith/4302",
        title: "إنما الأعمال بالنيات",
        quote: "إنما الأعمال بالنيات، وإنما لكل امرئ ما نوى",
        page: "عن عمر بن الخطاب رضي الله عنه قال: سمعت رسول الله ﷺ يقول: إنما الأعمال بالنيات، وإنما لكل امرئ ما نوى. متفق عليه.",
      },
    ]);
    suggestions = [
      { q: "هل يجوز العمل بلا نية؟", id: "P1" }, // حكم: يُرفض
      { q: "ما نص حديث «إنما الأعمال بالنيات»؟", id: "P1" },
      { q: "سؤال لا يجيبه نص", id: "P9" }, // لا نص بهذا الرقم: يُرفض
      { q: "هل يجوز لي أن أصلي بلا نية؟", id: "P1" }, // حالة شخصية: يُرفض
    ];
    const r = await brain.respond(q);
    assert.equal(r.kind, "abstain");
    assert.match(r.text, /^لم أجد جواباً كافياً في المصادر المعتمدة\./);
    assert.match(r.text, /نصوص قريبة من سؤالك/);
    assert.equal(r.related?.length, 1);
    assert.equal(r.related![0].url, "https://hadeethenc.com/ar/browse/hadith/4302");
    assert.equal(r.related![0].text, "إنما الأعمال بالنيات، وإنما لكل امرئ ما نوى");
    assert.deepEqual(r.suggestions, ["ما نص حديث «إنما الأعمال بالنيات»؟"]);
    assert.deepEqual(brain.finalCheck(r, q).findings, []);
  });

  it("لا شيء قريب أبداً: الامتناع وحده مع اقتراح الإحالة (بلا قائمة فارغة)", async () => {
    const q = "ما اسم الجبل الذي في السؤال الغريب؟";
    CLASS[q] = { level: "A", ar: ["جبل غريب"] };
    scoreOf = () => 0;
    answerText = "لم أجد جواباً كافياً في المصادر المعتمدة.";
    const r = await brain.respond(q);
    assert.equal(r.kind, "abstain");
    assert.equal(r.text, `${messages.message("abstain", "ar")} ${messages.message("suggestExpert", "ar")}`);
    assert.deepEqual(r.related, []);
    assert.deepEqual(r.suggestions, []);
  });
});

describe("الردود الثابتة الجديدة سليمة عند الحارس بكل اللغات", () => {
  it("fatwasFound وfatwasExpert وpartialFound", async () => {
    const { guard } = await import("../lib/brain/guard");
    for (const key of ["fatwasFound", "fatwasExpert", "partialFound", "hadithFromDorar"] as const) {
      for (const [lang, text] of Object.entries(messages.MESSAGES[key])) {
        assert.equal(guard(text).ok, true, `${key}/${lang}: ${guard(text).findings.map((f) => f.match).join(", ")}`);
      }
    }
  });
});

describe("«ابحث واقرأ» في الرد (R1b)", () => {
  it("D: فتوى من islamqa قرأتها الطبقة ← بطاقة بالاقتباس الموثَّق، و«رابط فقط» بلا مقتطف، وخارج المرجعية محذوف", async () => {
    const q = "طلقت زوجتي في حالة غضب شديد ولا أذكر ما قلت، فهل وقع؟";
    CLASS[q] = { level: "D", ar: ["طلاق الغضبان"] };
    scoreOf = (_q, b) => (/غضب|الغضبان|الحلف بالطلاق/.test(b) ? 85 : 20);
    webRequests.length = 0;
    webReply = webResponse([
      {
        url: "https://islamqa.info/ar/answers/45174",
        title: "حكم طلاق الغضبان",
        quote: "الغضب الشديد الذي يغلق على الإنسان عقله لا يقع معه الطلاق",
        page: "الحمد لله. الغضب الشديد الذي يغلق على الإنسان عقله لا يقع معه الطلاق، والغضب اليسير يقع معه.",
      },
      { url: "https://binbaz.org.sa/fatwas/999", title: "الطلاق في الغضب", quote: "نص لم تُرجع الأداة صفحته" },
      { url: "https://ar.islamway.net/fatwa/1", title: "خارج المرجعية", quote: "أي نص" },
    ]);
    const r = await brain.respond(q);
    assert.equal(r.kind, "referral");
    assert.match(webRequests[0].system, /CASE MODE/);
    const cards = r.fatwas ?? [];
    const iq = cards.find((f) => f.url === "https://islamqa.info/ar/answers/45174");
    assert.ok(iq, "بطاقة islamqa");
    assert.equal(iq!.excerpt, "الغضب الشديد الذي يغلق على الإنسان عقله لا يقع معه الطلاق");
    assert.equal(iq!.mufti, "الإسلام سؤال وجواب");
    const bz = cards.find((f) => f.url === "https://binbaz.org.sa/fatwas/999");
    assert.equal(bz?.excerpt, "", "«رابط فقط»: بلا مقتطف");
    assert.ok(!cards.some((f) => /islamway/.test(f.url)));
    assert.deepEqual(brain.finalCheck(r, q).findings, [], "الحارس على كلام الأداة وحده");
    webReply = webResponse([]);
  });

  it("A/B: الاقتباس الموثَّق نص للصياغة، و«رابط فقط» لا يدخلها أبداً بل يُعرض رابطاً", async () => {
    const q = "ما فضل صيام يوم عرفة؟";
    CLASS[q] = { level: "A", ar: ["صيام يوم عرفة"] };
    scoreOf = (_q, b) => (/عرفة/.test(b) ? 90 : 5);
    webReply = webResponse([
      {
        url: "https://hadeethenc.com/ar/browse/hadith/3011",
        title: "صيام يوم عرفة",
        quote: "صيام يوم عرفة، أحتسب على الله أن يكفر السنة التي قبله، والسنة التي بعده",
        page: "عن أبي قتادة رضي الله عنه: صيام يوم عرفة، أحتسب على الله أن يكفر السنة التي قبله، والسنة التي بعده. رواه مسلم.",
      },
      { url: "https://islamenc.com/ar/qa/fadl-arafa", title: "فضل يوم عرفة", quote: "اقتباس غير موجود في أي صفحة مقروءة" },
    ]);
    answerText = "صيام يوم عرفة يكفّر السنة التي قبله والسنة التي بعده كما في الحديث [1].";
    const r = await brain.respond(q);
    assert.equal(r.kind, "answer", r.text);
    assert.ok(r.passages.some((p) => p.url === "https://hadeethenc.com/ar/browse/hadith/3011" && /صيام يوم عرفة، أحتسب/.test(p.text)));
    assert.ok(!r.passages.some((p) => p.url === "https://islamenc.com/ar/qa/fadl-arafa"), "«رابط فقط» لا يُرسل للصياغة");
    assert.deepEqual(r.links, [{ title: "فضل يوم عرفة", url: "https://islamenc.com/ar/qa/fadl-arafa", site: "موسوعة المحتوى الإسلامي باللغات" }]);
    assert.equal(r.diag.retrieval?.web?.verified, 1);
    assert.equal(r.diag.retrieval?.web?.linkOnly, 1);
    webReply = webResponse([]);
  });

  it("التحقق من حديث بلا نص من المصادر: سطر ثابت يسبق بطاقة الدرر، لا امتناع ولا زر إحالة (R1c)", async () => {
    const q = "هل حديث «اطلبوا العلم ولو بالصين» صحيح؟";
    CLASS[q] = { level: "A", ar: ["طلب العلم"] };
    scoreOf = () => 0;
    // لا نص فيه حكم الحديث: النموذج يمتنع (أو لا نصوص أصلاً) ← السطر الثابت لا الامتناع.
    answerText = "لم أجد جواباً كافياً في المصادر المعتمدة.";
    const r = await brain.respond(q);
    assert.equal(r.kind, "answer");
    assert.equal(r.text, "هذه أحكام المحدّثين على هذا الحديث من الموسوعة الحديثية (الدرر السنية)، بنصّها:");
    assert.deepEqual(r.hadithCheck, { query: "اطلبوا العلم ولو بالصين", fallback: true });
    assert.deepEqual(brain.finalCheck(r, q).findings, []);
  });

  it("التحقق من حديث مع اقتباس موثَّق: سطر من النص المنقول فقط (الحكم ومن قاله)", async () => {
    const q = "ما صحة حديث «من كذب علي متعمدا فليتبوأ مقعده من النار»؟";
    CLASS[q] = { level: "A", ar: ["من كذب علي متعمدا"] };
    scoreOf = (_q, b) => (/كذب علي/.test(b) ? 95 : 0);
    webReply = webResponse([
      {
        url: "https://dorar.net/hadith/sharh/1",
        title: "من كذب علي متعمدا",
        quote: "من كذب علي متعمدا فليتبوأ مقعده من النار. خلاصة حكم المحدث: صحيح",
        page: "الراوي: أبو هريرة. من كذب علي متعمدا فليتبوأ مقعده من النار. خلاصة حكم المحدث: صحيح. المحدث: البخاري.",
      },
    ]);
    answerText = "حكم عليه البخاري بأنه «صحيح» [1].";
    const r = await brain.respond(q);
    assert.match(lastChatSystem, /HADITH CHECK/);
    assert.equal(r.kind, "answer", r.text);
    assert.equal(r.text, "حكم عليه البخاري بأنه «صحيح» [1].");
    assert.equal(r.hadithCheck?.fallback, undefined);
    webReply = webResponse([]);
  });
});

describe("لا فتوى من سؤال سابق ولا بلا تقييم صلة (R1c، البند 8)", () => {
  const DIVORCE_FATWA = {
    url: "https://binbaz.org.sa/fatwas/12345",
    title: "الطلاق في الغضب",
    quote: "الطلاق في حال الغضب الشديد الذي يغلق على صاحبه قصده لا يقع",
    page: "الجواب: الطلاق في حال الغضب الشديد الذي يغلق على صاحبه قصده لا يقع، والله أعلم.",
  };

  it("عبارات بحث ملوّثة بسؤال سابق: الفتوى تُقيَّم ضد السؤال الحالي فلا تظهر", async () => {
    const q = "ما معنى حديث «اطلبوا العلم» ومن رواه؟";
    // المصنّف حمل موضوع السؤال السابق (الطلاق) إلى عبارات البحث، والطبقة جاءت بفتوى الطلاق.
    CLASS[q] = { level: "A", ar: ["الطلاق في الغضب", "طلب العلم"] };
    scoreOf = (question, b) => (/الطلاق|الغضب/.test(b) && !/طلاق|غضب/.test(question) ? 10 : 0);
    webReply = webResponse([DIVORCE_FATWA]);
    const r = await brain.respond(q, { history: [{ role: "user", content: "طلقت زوجتي وأنا غاضب جداً، هل وقع الطلاق؟" }] });
    assert.ok(!(r.fatwas ?? []).some((f) => /binbaz/.test(f.url)), "فتوى الطلاق لا تظهر تحت سؤال آخر");
    webReply = webResponse([]);
  });

  it("تعذّر تقييم الصلة بالنموذج: لا فتوى ولا «رابط فقط» تُقبل بالاحتياط (كان kw المصطنع يمنحها 80)", async () => {
    const q = "ما فضل طلب العلم؟";
    CLASS[q] = { level: "A", ar: ["طلب العلم"] };
    webReply = webResponse([DIVORCE_FATWA, { url: "https://islamenc.com/ar/qa/9", title: "عنوان", quote: "" }]);
    relevanceFails = true;
    try {
      const r = await brain.respond(q);
      assert.deepEqual(r.fatwas ?? [], []);
      assert.ok(!(r.links ?? []).length);
      assert.ok(!r.passages.some((p) => /binbaz/.test(p.url)));
      assert.equal(r.diag.retrieval?.rerank, "keywords");
    } finally {
      relevanceFails = false;
      webReply = webResponse([]);
    }
  });
});

