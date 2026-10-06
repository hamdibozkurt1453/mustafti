/**
 * اختبارات F2b (بلا شبكة): التحية والشكر والكلام العادي إلى شخصية الصفحة مباشرة (لا تصنيف ولا استرجاع
 * ولا حارس)، والرد اللطيف لما هو خارج الدين، والأسئلة الدينية على مسارها؛ والشريط الجانبي بكامل الارتفاع؛
 * والأذكار الموقوتة داخل بطاقة المواقيت، واستعلام الأذكار يرجع الصفوف الـ29 مجمّعة بالفئات (PGlite).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { groupAdhkar, toDhikrs } from "../lib/adhkar/group";
import { OCCASIONS, type DhikrRow } from "../lib/adhkar/rules";
import { message } from "../lib/brain/messages";
import { detectSmallTalk, smallTalkFallback, smallTalkSuggestions, validSmallTalkReply } from "../lib/brain/small-talk";
import { navItems } from "../components/nav-items";

process.env.OPENROUTER_API_KEY = "test";
process.env.LLM_MODEL = "test-model";
process.env.MCP_URL = "http://127.0.0.1:9/mcp";
process.env.FEATURE_WEB_TOOLS = "false";
delete process.env.LLM_FALLBACK_MODEL;
delete process.env.LLM_REASONING;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ---------------------------------------------------------------------------
// نموذج وهمي: يسجّل كل طلب باسم مخططه، ويرد على المحادثة العادية والتصنيف.
// ---------------------------------------------------------------------------

const calls: { name: string; system: string; user: string }[] = [];
let outOfScope = false;
let talkReply = "وعليكم السلام ورحمة الله، أهلاً بك في مُستفتي. كيف أستطيع مساعدتك اليوم؟";

const json = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }], usage: {} }), { status: 200 });

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.includes("openrouter.ai")) throw new TypeError("fetch failed");
  const body = JSON.parse(String(init?.body ?? "{}"));
  const name: string = body.response_format?.json_schema?.name ?? "chat";
  const msgs = body.messages as { role: string; content: string }[];
  calls.push({ name, system: msgs.find((m) => m.role === "system")?.content ?? "", user: [...msgs].reverse().find((m) => m.role === "user")?.content ?? "" });
  if (name === "small_talk") return json(JSON.stringify({ reply: talkReply, suggestions: ["سؤال أول؟", "سؤال ثانٍ؟", "سؤال ثالث؟"] }));
  if (name === "classification")
    return json(
      JSON.stringify({
        lang: "ar",
        userType: "muslim",
        level: "B",
        urgent: false,
        outOfScope,
        aboutMustafti: false,
        chapter: null,
        needsClarification: false,
        misconception: null,
        searchQueries: { ar: [], userLang: [] },
      }),
    );
  if (name === "citation_plan") return json(JSON.stringify({ quran: [], surah_info: [], quran_index: false, quran_queries: [], hadith_queries: [], bayyinat_queries: [] }));
  return json("");
}) as typeof fetch;

let brain: typeof import("../lib/brain/respond");
before(async () => {
  brain = await import("../lib/brain/respond");
});

// ---------------------------------------------------------------------------
// 1) المحادثة العادية
// ---------------------------------------------------------------------------

const TALK: [string, string][] = [
  ["مرحبا", "greeting"],
  ["السلام عليكم", "greeting"],
  ["السلام عليكم ورحمة الله وبركاته", "greeting"],
  ["أهلاً وسهلاً!", "greeting"],
  ["صباح الخير يا مستفتي", "greeting"],
  ["شكراً جزيلاً", "thanks"],
  ["جزاك الله خيراً", "thanks"],
  ["hello", "greeting"],
  ["Hi there 👋", "greeting"],
  ["Assalamu alaikum", "greeting"],
  ["thank you so much", "thanks"],
  ["Merhaba", "greeting"],
  ["teşekkürler", "thanks"],
  ["Bonjour !", "greeting"],
  ["merci beaucoup", "thanks"],
  ["السلام علیکم", "greeting"],
  ["شکریہ", "thanks"],
  ["Terima kasih", "thanks"],
  ["Halo, apa kabar?", "greeting"],
];

describe("F2b · المحادثة العادية تُكشف بكل اللغات", () => {
  it("التحية والشكر بست لغات", () => {
    for (const [text, kind] of TALK) assert.equal(detectSmallTalk(text), kind, text);
  });

  it("السؤال عن المنصة والوداع والكلام العادي", () => {
    assert.equal(detectSmallTalk("من أنت؟"), "about_platform");
    assert.equal(detectSmallTalk("مرحبا، ماذا تستطيع أن تفعل؟"), "about_platform");
    assert.equal(detectSmallTalk("What can you do?"), "about_platform");
    assert.equal(detectSmallTalk("مع السلامة"), "farewell");
    assert.equal(detectSmallTalk("كيف حالك؟"), "small_talk");
    assert.equal(detectSmallTalk("شكراً وجزاك الله خيراً"), "thanks");
  });

  it("15 تحية وشكراً بست لغات تمرّ إلى شخصية الصفحة مباشرة، بلا تصنيف ولا استرجاع", async () => {
    for (const [text] of TALK.slice(0, 15)) {
      calls.length = 0;
      const r = await brain.respond(text);
      assert.equal(r.kind, "chitchat", text);
      assert.deepEqual(calls.map((c) => c.name), ["small_talk"], text);
      assert.match(calls[0].system, /PERSONA: «مُستفتي»/);
      assert.equal(r.suggestions?.length, 3, text);
      assert.equal(r.passages.length, 0);
    }
  });

  it("شخصية الصفحة: المرشد والداعية", async () => {
    calls.length = 0;
    await brain.respond("مرحبا", { mode: "new_muslim" });
    assert.match(calls[0].system, /new Muslim|المسلم الجديد|مرشد/i);
    calls.length = 0;
    await brain.respond("hello", { mode: "discover" });
    assert.match(calls[0].system, /داعية|da'i|non-Muslim/i);
  });

  it("رد يذكر نموذجاً أو مزوّداً يُستبدل بالرد الثابت الدافئ", async () => {
    talkReply = "Hello! I am Gemma, made by Google.";
    const r = await brain.respond("hello");
    talkReply = "وعليكم السلام ورحمة الله، أهلاً بك في مُستفتي. كيف أستطيع مساعدتك اليوم؟";
    assert.equal(r.kind, "chitchat");
    assert.doesNotMatch(r.text, /gemma|google/i);
    assert.equal(r.text, smallTalkFallback("greeting", "general", "en"));
    assert.equal(validSmallTalkReply("Hello from ChatGPT"), false);
  });

  it("الرد الثابت: «وعليكم السلام»، و«وإياك» للشكر، وثلاثة أسئلة لكل شخصية", () => {
    assert.match(smallTalkFallback("greeting", "general", "ar"), /^وعليكم السلام ورحمة الله، أهلاً بك في مُستفتي\. كيف أستطيع مساعدتك اليوم؟ يمكنك أن تسألني عن أي مسألة في دينك\.$/);
    assert.match(smallTalkFallback("thanks", "general", "ar"), /^وإياك/);
    for (const mode of ["general", "new_muslim", "discover"] as const) assert.equal(smallTalkSuggestions(mode, "fr").length, 3);
  });
});

describe("F2b · خارج النطاق: الرد اللطيف لما هو خارج الدين فعلاً", () => {
  const OUT = ["كيف أكتب دالة بلغة بايثون؟", "ما حالة الطقس في الرياض غداً؟", "من فاز بكأس العالم 2022؟", "What is the best laptop for gaming?", "اقترح لي فيلماً أشاهده الليلة"];

  it("5 أسئلة خارج النطاق ليست محادثة عادية، وتأخذ الرد اللطيف", async () => {
    outOfScope = true;
    for (const q of OUT) {
      assert.equal(detectSmallTalk(q), null, q);
      const r = await brain.respond(q);
      assert.equal(r.kind, "out_of_scope", q);
      assert.equal(r.text, message("outOfScope", "ar"));
    }
    outOfScope = false;
  });

  it("الصياغة الجديدة ألطف", () => {
    assert.equal(
      message("outOfScope", "ar"),
      "أهلاً بك. مُستفتي متخصص في أسئلة الدين الإسلامي، فلا أستطيع المساعدة في هذا الموضوع. هل لديك سؤال عن العبادات أو العقيدة أو المعاملات؟",
    );
    assert.doesNotMatch(message("outOfScope", "ar"), /عذراً/);
    assert.match(src("lib/brain/prompts.ts"), /Greetings, thanks, farewells and small talk .* are NOT outOfScope/);
  });
});

describe("F2b · الأسئلة الدينية تبقى على مسارها", () => {
  const RELIGIOUS = ["السلام عليكم، ما حكم صلاة الجماعة؟", "كيف أصلي صلاة الفجر؟", "شكراً، وما فضل الصدقة؟", "Hello, how do I perform wudu?", "Merhaba, oruç nasıl tutulur?"];

  it("5 أسئلة دينية لا تُعد محادثة عادية، فتمر على المصنّف", async () => {
    for (const q of RELIGIOUS) {
      assert.equal(detectSmallTalk(q), null, q);
      calls.length = 0;
      await brain.respond(q).catch(() => null);
      assert.ok(calls.some((c) => c.name === "classification"), q);
      assert.ok(!calls.some((c) => c.name === "small_talk"), q);
    }
  });

  it("سؤال النموذج والتلاعب لهما ردهما الثابت لا المحادثة العادية", async () => {
    calls.length = 0;
    const r = await brain.respond("ما النموذج؟");
    assert.equal(r.kind, "identity");
    assert.equal(calls.length, 0);
  });

  it("الواجهة تعرض الأسئلة المقترحة للمحادثة العادية بكل اللغات", () => {
    assert.match(src("components/chat/BotReply.tsx"), /msg\.kind === "chitchat"/);
    for (const l of ["ar", "en", "id", "ur", "bn", "tr", "fa", "fr", "ms", "ru", "sw", "ha"]) {
      const m = JSON.parse(src(`messages/${l}.json`)) as { chat: Record<string, string> };
      assert.ok(m.chat.chitchatSuggest, l);
    }
  });
});

// ---------------------------------------------------------------------------
// 2) الشريط الجانبي
// ---------------------------------------------------------------------------

describe("F2b · الشريط الجانبي بكامل الارتفاع", () => {
  it("على الحاسوب عمود sticky من أسفل الرأس إلى أسفل الشاشة، وعلى الهاتف بزر", () => {
    const s = src("components/chat/ConversationSidebar.tsx");
    assert.match(s, /lg:sticky lg:top-16 lg:bottom-auto/);
    assert.match(s, /lg:h-\[calc\(100svh-4rem\)\]/);
    assert.match(s, /docked \? "top-20 bottom-auto lg:hidden"/);
    const v = src("components/home/ChatView.tsx");
    assert.match(v, /lg:flex-row/);
    assert.match(v, /docked \? "lg:start-72" : ""/); // الخانة المثبتة لا تغطي أسفل الشريط
  });
});

// ---------------------------------------------------------------------------
// 3) الأذكار
// ---------------------------------------------------------------------------

describe("F2b · استعلام الأذكار يرجع الصفوف الـ29 مجمّعة بالفئات (PGlite)", () => {
  const db = new PGlite();

  it("بصلاحية anon بعد migration الإصلاح، ومجمّعة بالفئات الست", async () => {
    await db.exec("create role anon; create role authenticated;");
    await db.exec(src("supabase/migrations/20261005_adhkar.sql"));
    await db.exec(src("supabase/migrations/20261014_adhkar_timed.sql"));
    // حالة الإنتاج: صلاحية anon مسحوبة، فالقراءة العامة تُرفض.
    await db.exec("revoke select on public.adhkar from anon;");
    await db.exec("set role anon;");
    await assert.rejects(db.query("select hadith_id from public.adhkar"), /permission denied/);
    await db.exec("reset role;");
    await db.exec(src("supabase/migrations/20261015_adhkar_public_read.sql"));
    await db.exec(src("supabase/migrations/20261015_adhkar_public_read.sql")); // آمن لإعادة التشغيل

    await db.exec("set role anon;");
    const rows = (
      await db.query<DhikrRow>(
        "select hadith_id, lang, occasions, position, title, text, explanation, grade, repeat_count, source_url, transliteration, meaning_en, reference from public.adhkar where lang = any($1) order by position",
        [["ar"]],
      )
    ).rows;
    await db.exec("reset role;");
    assert.equal(rows.length, 29);

    const items = toDhikrs(rows, "ar");
    assert.equal(items.length, 29);
    const groups = groupAdhkar(items);
    assert.deepEqual(Object.keys(groups), [...OCCASIONS]);
    for (const o of OCCASIONS) assert.ok(groups[o].length > 0, o);
    assert.equal(groups.before_prayer.length, 4);
    assert.ok(groups.after_prayer.some((d) => d.id === "seed-istighfar-3"));
    assert.ok(groups.sleep.some((d) => d.id === "seed-ayat-al-kursi") && groups.morning.some((d) => d.id === "seed-ayat-al-kursi"));
    const total = OCCASIONS.reduce((n, o) => n + groups[o].length, 0);
    assert.equal(total, items.reduce((n, d) => n + d.occasions.length, 0));
    // لغير العربية: المعنى بالإنجليزية من البذرة.
    assert.match(toDhikrs(rows, "fr")[0].meaning ?? "", /Allah/);
  });

  it("القراءة بمفتاح الخادم احتياطاً إن رُفضت العامة", () => {
    const s = src("lib/adhkar/store.ts");
    assert.match(s, /if \(!rows && isAdminClientConfigured\(\)\)/);
    assert.match(s, /readRows\(createAdminClient\(\), langs\)/);
  });

  it("داخل بطاقة المواقيت: الذكر الأول بعدّاده و«التالي»، ورابط «كل الأذكار»، ولا بطاقة مستقلة", () => {
    const card = src("components/home/PrayerCard.tsx");
    assert.match(card, /<TimedDhikr moment=\{moment\} adhkar=\{adhkar\} \/>/);
    const timed = src("components/home/TimedDhikr.tsx");
    assert.match(timed, /border-t border-gold-500\/40/);
    assert.match(timed, /t\("next"\)/);
    assert.match(timed, /t\("counterLabel"/);
    assert.match(timed, /pathname: "\/adhkar"/);
    assert.match(timed, /state\.occasion === occasion \?/); // تتبدّل الفئة مع الوقت من أول ذكر
    assert.doesNotMatch(src("components/home/HomeExperience.tsx"), /AdhkarCard/);
  });

  it("/adhkar صفحة ثانوية: لا في القائمة الرئيسية ولا في التذييل", () => {
    assert.ok(!navItems.map((i) => String(i.href)).includes("/adhkar"));
    assert.doesNotMatch(src("components/SiteFooter.tsx"), /\/adhkar/);
    assert.match(src("app/[locale]/adhkar/page.tsx"), /groupAdhkar\(items\)/);
  });
});
