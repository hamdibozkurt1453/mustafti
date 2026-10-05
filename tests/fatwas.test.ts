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

const reply = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }], usage: {} }), { status: 200, headers: { "Content-Type": "application/json" } });

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes("openrouter.ai")) {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const name: string | undefined = body.response_format?.json_schema?.name;
    const msgs = body.messages as { role: string; content: string }[];
    const user = [...msgs].reverse().find((m) => m.role === "user")?.content ?? "";
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
    scoreOf = (_q, b) => (/إنما الأعمالُ بالنِّيَّاتِ/.test(b) ? 50 : 10);
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
    assert.equal(r.related![0].grade, "[صحيح]");
    assert.deepEqual(r.suggestions, ["ما نص حديث «إنما الأعمال بالنيات»؟"]);
    assert.deepEqual(brain.finalCheck(r, q).findings, []);
  });

  it("لا شيء قريب أبداً: الامتناع وحده مع اقتراح الإحالة (بلا قائمة فارغة)", async () => {
    const q = "ما اسم الجبل الذي في السؤال الغريب؟";
    CLASS[q] = { level: "A", ar: ["جبل غريب"] };
    scoreOf = () => 0;
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
    for (const key of ["fatwasFound", "fatwasExpert", "partialFound"] as const) {
      for (const [lang, text] of Object.entries(messages.MESSAGES[key])) {
        assert.equal(guard(text).ok, true, `${key}/${lang}: ${guard(text).findings.map((f) => f.match).join(", ")}`);
      }
    }
  });
});
