/**
 * R5 بلا شبكة: ثلاث شخصيات مسلمة مستقلة، والصياغة الحرة بقاعدة الدليل، والبث والسرعة،
 * وتنظيف بطاقات المصادر، وذاكرة الأجوبة.
 *   npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";

import { checkAnswer, closestSpan, guard, repairAnswer, splitUnits } from "../lib/brain/guard";
import { CHAT_MODES, type ChatMode } from "../lib/brain/modes";
import { FORBIDDEN_PHRASES, personaFor, personaIssues, PERSONAS, stripPersonaPhrases } from "../lib/brain/personas";
import { answerSystem } from "../lib/brain/prompts";
import { clean, CLEAR_MIN, isClearMatch, keywords, looksLikeCode, stripCode, type Candidate } from "../lib/brain/rank";
import { fatwaExcerpt, showFatwaCard, validUrl } from "../lib/chat/cards";
import { LABEL_KEYS, localizeLabels } from "../lib/chat/labels";

process.env.OPENROUTER_API_KEY = "test";
process.env.LLM_MODEL = "test-model";
process.env.MCP_URL = "http://127.0.0.1:9/mcp";
process.env.FEATURE_WEB_TOOLS = "false";
delete process.env.LLM_FALLBACK_MODEL;
delete process.env.LLM_REASONING;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const fixture = (name: string) => read(`tests/fixtures/${name}`);

// ---------------------------------------------------------------------------
// نموذج وهمي: التصنيف والتقييم، والصياغة كاملة أو مبثوثة (SSE) بأجوبة متتالية.
// ---------------------------------------------------------------------------

let answers: string[] = [];
let level = "B";
const bodies: { name: string; body: Record<string, unknown> }[] = [];

const json = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }], usage: {} }), { status: 200 });

/** جواب مبثوث: أجزاء صغيرة (كل 7 أحرف) بصيغة SSE. */
const sse = (content: string) => {
  const enc = new TextEncoder();
  const parts = content.match(/[\s\S]{1,7}/g) ?? [];
  return new Response(
    new ReadableStream({
      start(c) {
        for (const p of parts) c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`));
        c.enqueue(enc.encode("data: [DONE]\n\n"));
        c.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
};

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes("openrouter.ai")) {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const name: string = body.response_format?.json_schema?.name ?? (body.tools ? "web" : "chat");
    bodies.push({ name, body });
    const msgs = body.messages as { role: string; content: string }[];
    const user = [...msgs].reverse().find((m) => m.role === "user")?.content ?? "";
    if (name === "classification") {
      return json(
        JSON.stringify({
          lang: "ar",
          userType: "muslim",
          level,
          urgent: false,
          outOfScope: false,
          aboutMustafti: false,
          chapter: "salah",
          needsClarification: false,
          misconception: null,
          searchQueries: { ar: ["قضاء صلاة الفجر"], userLang: [] },
        }),
      );
    }
    if (name === "citation_plan") return json(JSON.stringify({ quran: [], surah_info: [], quran_index: false, quran_queries: [], hadith_queries: [], bayyinat_queries: [] }));
    if (name === "relevance") {
      const ids = [...user.matchAll(/\[(S\d+)\]/g)].map((m) => m[1]);
      return json(JSON.stringify({ scores: ids.map((id) => ({ id, score: 90 })) }));
    }
    if (name === "suggestions") return json(JSON.stringify({ questions: [] }));
    const n = bodies.filter((b) => b.name === "chat").length;
    const content = answers[Math.min(n - 1, answers.length - 1)] ?? "";
    return body.stream ? sse(content) : json(content);
  }
  const u = new URL(url);
  if (u.hostname === "api.quranpedia.net") {
    const path = decodeURIComponent(u.pathname);
    return new Response(path.endsWith("/fatwas") ? fixture("quranpedia-fatwas.json") : "{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }
  throw new TypeError("fetch failed");
}) as typeof fetch;

let brain: typeof import("../lib/brain/respond");
let cache: typeof import("../lib/brain/answer-cache");
before(async () => {
  brain = await import("../lib/brain/respond");
  cache = await import("../lib/brain/answer-cache");
});

/** موجّه النظام في آخر طلب صياغة. */
const lastSystem = () => {
  const chats = bodies.filter((b) => b.name === "chat");
  return String((chats.at(-1)!.body.messages as { content: string }[])[0].content);
};

// ---------------------------------------------------------------------------
// 1) الشخصيات الثلاث
// ---------------------------------------------------------------------------

describe("R5 · ثلاث شخصيات، لكل وضع موجّه مستقل في lib/brain/personas/", () => {
  it("لكل mode ملفه وشخصيته", () => {
    assert.equal(personaFor("general").id, "general");
    assert.equal(personaFor("new_muslim").id, "new_muslim");
    assert.equal(personaFor("discover").id, "discover");
    for (const [file, id] of [
      ["lib/brain/personas/general.ts", "general"],
      ["lib/brain/personas/new-muslim.ts", "new_muslim"],
      ["lib/brain/personas/discover.ts", "discover"],
    ]) {
      assert.match(read(file), new RegExp(`id: "${id}"`), file);
    }
    assert.match(personaFor("general").system, /مساعد علمي مسلم/);
    assert.match(personaFor("new_muslim").system, /مرشد المسلم الجديد/);
    assert.match(personaFor("discover").system, /داعية مسلم/);
  });

  it("تعليمات الجواب تحمل موجّه الشخصية الصحيح وحده لكل وضع", () => {
    for (const mode of CHAT_MODES) {
      const sys = answerSystem({ question: "س", lang: "ar", mode: "general", passages: [], chatMode: mode });
      assert.ok(sys.includes(PERSONAS[mode].system), mode);
      for (const other of CHAT_MODES.filter((m) => m !== mode)) assert.ok(!sys.includes(PERSONAS[other].system), `${mode} ≠ ${other}`);
      assert.match(sys, /EVIDENCE RULE/);
    }
  });

  it("القاعدة المشتركة: مسلمة من أهل السنة، تتكلم من داخل الإسلام، وتنهى عن العبارات المحايدة", () => {
    for (const mode of CHAT_MODES) {
      const s = personaFor(mode).system;
      assert.match(s, /Ahl al-Sunnah/);
      assert.match(s, /INSIDE Islam/);
      assert.match(s, /تذكر المصادر/);
      assert.match(s, /أكثر من صياغة/);
      assert.doesNotMatch(s, /gemma|google|openrouter|anthropic|openai|claude|gpt/i);
    }
    assert.match(personaFor("new_muslim").system, /NUMBERED steps/);
    assert.match(personaFor("new_muslim").system, /Do NOT paste long hadith/);
    assert.match(personaFor("discover").system, /هل انتشر الإسلام بالسيف/);
    assert.match(personaFor("discover").system, /لَا إِكْرَاهَ فِي الدِّينِ/);
    assert.match(personaFor("discover").system, /Indonesia and Africa/);
  });

  it("العبارات الممنوعة تُكشف، وعبارات التمهيد تُحذف بالكود", () => {
    assert.ok(FORBIDDEN_PHRASES.length >= 4);
    assert.ok(personaIssues("تذكر المصادر هنا أكثر من صياغة: منها أنه انتشر بالدعوة").length >= 2);
    assert.ok(personaIssues("According to the passages, fasting is…").length);
    assert.deepEqual(personaIssues("انتشر الإسلام بالدعوة والحجة والقدوة الحسنة [1]."), []);
    assert.equal(stripPersonaPhrases("تذكر المصادر أن الصلاة عمود الدين [1]."), "الصلاة عمود الدين [1].");
    assert.equal(stripPersonaPhrases("According to the sources, prayer is the pillar [1]."), "Prayer is the pillar [1].");
  });

  for (const mode of CHAT_MODES) {
    it(`${mode}: الموجّه الصحيح في الطلب، والعبارات الممنوعة لا تظهر في الجواب`, async () => {
      level = "B";
      answers = [
        "تذكر المصادر هنا أكثر من صياغة: منها أن من نام عن الصلاة يصليها إذا استيقظ [1].",
        "من نام عن الصلاة يصليها إذا استيقظ [1]. وهذا من رحمة الله بعباده.",
      ];
      bodies.length = 0;
      const r = await brain.respond(`كيف يقضي النائم صلاته؟ ${mode}`, { mode: mode as ChatMode });
      assert.equal(r.kind, "answer", r.diag.abstainReason);
      assert.ok(lastSystem().includes(PERSONAS[mode].system), "موجّه الشخصية");
      assert.deepEqual(personaIssues(r.text), [], r.text);
      assert.doesNotMatch(r.text, /تذكر المصادر|أكثر من صياغة/);
      assert.equal(bodies.filter((b) => b.name === "chat").length, 2, "إعادة بصوت الشخصية");
    });
  }

  it("الداعية: مسألة C (شبهة) لا تُعرض خلافاً: لا سطر الخلاف ولا شارته", async () => {
    level = "C";
    answers = ["انتشر الإسلام بالدعوة والحجة والقدوة الحسنة، والله يقول: لا إكراه في الدين [1]. ويسعدني أن أجيب عن أسئلتك."];
    bodies.length = 0;
    const r = await brain.respond("هل انتشر الإسلام بالسيف؟ discover-c", { mode: "discover" });
    level = "B";
    assert.equal(r.kind, "answer", r.diag.abstainReason);
    assert.equal(r.khilaf, false);
    assert.doesNotMatch(r.text, /خلاف/);
    assert.doesNotMatch(lastSystem(), /SCHOLARLY DIFFERENCE/);
  });
});

// ---------------------------------------------------------------------------
// 2) قاعدة الدليل الجديدة
// ---------------------------------------------------------------------------

const HADITH = "عن النعمان بن بشير رضي الله عنهما قال: سمعت رسول الله ﷺ يقول: «إن الحلال بين، وإن الحرام بين، وبينهما أمور مشتبهات». الدرجة: صحيح، متفق عليه.";
const VERSE = "قال تعالى: ﴿لَا إِكْرَاهَ فِي الدِّينِ قَدْ تَبَيَّنَ الرُّشْدُ مِنَ الْغَيِّ﴾ [البقرة: 256]";
const CTX = { sources: [HADITH, VERSE] };

describe("R5 · قاعدة الدليل: الصياغة حرة، والحكم والدليل والنسبة بإشارة [n]", () => {
  it("جملة شرح أو تشجيع بلا رقم مقبولة", () => {
    const t = "الصلاة صلة بين العبد وربه، وستجدها أسهل مما تظن. خطوة خطوة، بارك الله فيك.";
    assert.deepEqual(checkAnswer(t, CTX).findings, []);
    assert.equal(repairAnswer(t, CTX).text, t);
  });

  it("حكم بلا مصدر مرفوض (تُحذف جملته)، والحكم نفسه بإشارته مقبول", () => {
    const bad = checkAnswer("الصلاة واجبة على كل مسلم بالغ عاقل.", CTX);
    assert.ok(bad.findings.some((f) => f.reason === "unsourced_ruling"), JSON.stringify(bad.findings));
    assert.deepEqual(checkAnswer("الصلاة واجبة على كل مسلم بالغ عاقل [1].", CTX).findings, []);
    assert.deepEqual(checkAnswer("أكل الربا حرام [2].", CTX).findings, []);
    const r = repairAnswer("الصلاة صلة بين العبد وربه. وأكل الربا حرام. والحلال بين [1].", CTX);
    assert.equal(r.text, "الصلاة صلة بين العبد وربه. والحلال بين [1].");
    assert.ok(r.fixes.some((f) => f.kind === "sentence_removed" && f.reason === "unsourced_ruling"));
  });

  it("الترجيح مقبول بإشارته فقط", () => {
    assert.ok(checkAnswer("والراجح أن القضاء على الفور.", CTX).findings.some((f) => f.reason === "unsourced_ruling"));
    assert.deepEqual(checkAnswer("والراجح عند أهل العلم أن القضاء على الفور [1].", CTX).findings, []);
  });

  it("اقتباس غير مطابق يُصحَّح إلى نص المصدر حرفياً", () => {
    const t = "قال تعالى: ﴿لا إكراه في الدين قد تبين الرشد من الغي والضلال﴾ [2].";
    const r = repairAnswer(t, CTX);
    assert.match(r.text, /﴿لَا إِكْرَاهَ فِي الدِّينِ قَدْ تَبَيَّنَ الرُّشْدُ مِنَ الْغَيِّ﴾ \[2\]/);
    assert.equal(r.fixes[0].kind, "quote_fixed");
    assert.deepEqual(checkAnswer(r.text, CTX).findings, []);
    assert.equal(closestSpan("لا إكراه في الدين قد تبين الرشد من الغي والضلال", CTX.sources), "لَا إِكْرَاهَ فِي الدِّينِ قَدْ تَبَيَّنَ الرُّشْدُ مِنَ الْغَيِّ");
  });

  it("اقتباس مختلق (آية أو حديث) يُحذف بجملته، ويبقى منع الاختلاق", () => {
    const t = "الحلال بين [1]. قال رسول الله ﷺ: «من شرب الشاي بعد الفجر زاد إيمانه» [1]. وفقك الله.";
    const r = repairAnswer(t, CTX);
    assert.equal(r.text, "الحلال بين [1]. وفقك الله.");
    assert.equal(r.fixes[0].kind, "quote_removed");
    // ونسبة حديث بلا نص منقول تُحذف أيضاً.
    assert.equal(repairAnswer("قال رسول الله ﷺ إن الشاي يزيد الإيمان [1]. وفقك الله.", CTX).text, "وفقك الله.");
  });

  it("الفتوى الشخصية واسم النموذج يمنعان الجواب كله (ولو بإشارة)", () => {
    assert.ok(repairAnswer("صلاتك باطلة [1].", CTX).blocked.length);
    assert.ok(repairAnswer("يجوز لك تأخير الصلاة [1].", CTX).blocked.length);
    assert.ok(repairAnswer("Your divorce has occurred [1].", CTX).blocked.length);
    assert.ok(repairAnswer("أنا مبني على Gemma [1].", CTX).blocked.length);
  });

  it("الحارس الصارم كما هو للردود الأخرى (لا حكم بكلام الأداة)", () => {
    assert.equal(guard("يجوز تأخير الصلاة [1].").ok, false);
  });

  it("الجمل لا تُقسم داخل الاقتباس، وإشارة [n] بعد النقطة تلحق بجملتها", () => {
    assert.deepEqual(splitUnits("قال ﷺ: «إن الحلال بين. وإن الحرام بين». [1] ثم شرح."), ["قال ﷺ: «إن الحلال بين. وإن الحرام بين». [1] ", "ثم شرح."]);
  });

  it("الجواب الحر بعناوين وخطوات يمر سليماً", () => {
    const t = "**خطوات الوضوء:**\n1. انوِ بقلبك [1].\n2. اغسل وجهك ويديك [1].\nلا تقلق إن أخطأت في البداية، ستتعلم بالتكرار.";
    assert.deepEqual(checkAnswer(t, CTX).findings, []);
    assert.equal(repairAnswer(t, CTX).text, t);
  });
});

// ---------------------------------------------------------------------------
// 3) البث والسرعة
// ---------------------------------------------------------------------------

describe("R5 · البث: المصادر أولاً، ثم الجواب جملةً جملة، ثم الجواب النهائي بعد التحقق", () => {
  it("onSources قبل أول جزء، والأجزاء المفحوصة تكوّن الجواب، والزمن لكل مرحلة", async () => {
    level = "B";
    answers = ["من نام عن الصلاة يصليها إذا استيقظ [1]. وهذا من رحمة الله.\nخطوة خطوة، بارك الله فيك."];
    bodies.length = 0;
    const events: string[] = [];
    let text = "";
    const r = await brain.respond("كيف يقضي النائم صلاته؟ بث", {
      onSources: (p) => events.push(`sources:${p.passages.length}`),
      onDelta: (d) => {
        events.push("delta");
        text += d;
      },
      onReset: () => events.push("reset"),
    });
    assert.equal(r.kind, "answer", r.diag.abstainReason);
    assert.ok(events[0].startsWith("sources:") && events.includes("delta"), events.join(","));
    assert.ok(events.filter((e) => e === "delta").length >= 2, "أكثر من جزء");
    assert.equal(text.trim(), r.text.trim());
    assert.equal(r.streamed, true);
    assert.equal(bodies.find((b) => b.name === "chat")!.body.stream, true);
    for (const k of ["classifyMs", "searchMs", "fastMs", "rerankMs", "generateMs", "firstTokenMs", "totalMs"] as const) {
      assert.equal(typeof r.timings[k], "number", k);
    }
  });

  it("اقتباس مختلق لا يصل إلى السائل أثناء البث، والجواب النهائي بلا جملته", async () => {
    answers = ["من نام عن الصلاة يصليها إذا استيقظ [1]. قال رسول الله ﷺ: «من شرب الشاي بعد الفجر زاد إيمانه» [1]. بارك الله فيك."];
    bodies.length = 0;
    let text = "";
    const r = await brain.respond("كيف يقضي النائم صلاته؟ بث ٢", { onDelta: (d) => (text += d) });
    assert.doesNotMatch(text, /الشاي/);
    assert.doesNotMatch(r.text, /الشاي/);
    assert.match(r.text, /بارك الله فيك/);
    assert.ok(r.guard?.findings.some((f) => /quote_removed/.test(f.match)));
  });

  it("محاولة ثانية بعد الامتناع: «reset» ثم الجواب", async () => {
    answers = ["لم أجد جواباً كافياً في المصادر المعتمدة.", "يصلي من نام عن الصلاة إذا استيقظ [1]."];
    bodies.length = 0;
    const events: string[] = [];
    const r = await brain.respond("كيف يقضي النائم صلاته؟ بث ٣", { onDelta: () => events.push("delta"), onReset: () => events.push("reset") });
    assert.equal(r.kind, "answer");
    assert.ok(events.includes("reset"));
    assert.ok(events.lastIndexOf("delta") > events.indexOf("reset"));
  });

  it("تخطّي الترتيب بالنموذج حين تكون المطابقة واضحة في مرشحين (R5b)", () => {
    const q = "ما شروط صحة الصلاة؟";
    const qt = keywords(q);
    const terms = [...qt, ...keywords("شروط الصلاة")];
    const strong: Candidate = { title: "شروط صحة الصلاة", text: "من شروط صحة الصلاة الطهارة واستقبال القبلة ودخول الوقت، وشروط الصلاة تسعة.", url: "u1", source: "s", sourceId: "islamqa" };
    const weak: Candidate = { title: "فضل الصيام", text: "الصيام عبادة عظيمة.", url: "u2", source: "s", sourceId: "islamqa" };
    assert.equal(isClearMatch(strong, qt, terms), true);
    assert.equal(isClearMatch(weak, qt, terms), false);
    assert.equal(CLEAR_MIN, 2, "R5b: وُسّع");
    const retrieval = read("lib/brain/retrieval.ts");
    assert.match(retrieval, /rerankSkipped = clear\.length >= CLEAR_MIN/);
    assert.match(retrieval, /const enough = \(\) => relevant\(all\) \+ glossary\.length >= EARLY_EXIT_MIN \|\| strongPinned\(all\)/, "لا تُنتظر «ابحث واقرأ» إن كفت السريعة");
  });

  it("الجلب المسبق مع التصنيف، والمسار يبث المصادر والأجزاء والجواب النهائي", () => {
    const respond = read("lib/brain/respond.ts");
    assert.ok(respond.indexOf("prefetchFast(question") < respond.indexOf("await classify(question"));
    const route = read("app/api/chat/route.ts");
    assert.match(route, /onSources: \(preview\)/);
    assert.match(route, /type: "final"/);
    assert.match(route, /type: "reset"/);
    assert.match(route, /brain:timings/);
    const chat = read("components/chat/useChat.ts");
    assert.match(chat, /case "final":/);
    assert.match(chat, /case "reset":/);
  });

  it("ذاكرة الأجوبة: السؤال موحَّداً والوضع واللغة، 7 أيام، وmigration بـ RLS", async () => {
    assert.equal(cache.answerCacheKey("ما حُكمُ الصلاةِ؟", "general", "ar"), cache.answerCacheKey("ما حكم الصلاة", "general", "ar"));
    assert.notEqual(cache.answerCacheKey("ما حكم الصلاة", "general", "ar"), cache.answerCacheKey("ما حكم الصلاة", "new_muslim", "ar"));
    assert.notEqual(cache.answerCacheKey("ما حكم الصلاة", "general", "ar"), cache.answerCacheKey("ما حكم الصلاة", "general", "en"));
    assert.equal(cache.ANSWER_CACHE_TTL_MS, 7 * 24 * 60 * 60 * 1000);
    assert.equal(await cache.readAnswerCache("س", "general", "ar"), null, "بلا Supabase: لا شيء ولا خطأ");
    const sql = read("supabase/migrations/20261010_answer_cache.sql");
    assert.match(sql, /create table if not exists public\.answer_cache/);
    assert.match(sql, /enable row level security/);
    assert.match(sql, /interval '7 days'/);
  });

  it("السؤال المكرر يُجاب فوراً من الذاكرة بلا نموذج", async () => {
    answers = ["يصلي من نام عن الصلاة إذا استيقظ [1]."];
    const q = "كيف يقضي النائم صلاته؟ ذاكرة";
    const first = await brain.respond(q, { cache: true });
    assert.equal(first.kind, "answer");
    bodies.length = 0;
    const again = await brain.respond(q, { cache: true });
    assert.equal(again.text, first.text);
    assert.equal(again.timings.cached, "memory");
    assert.equal(bodies.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 4) بطاقات المصادر
// ---------------------------------------------------------------------------

const JSON_LD = `{"@context":"https://schema.org","@type":"VideoObject","name":"صفة الصلاة","uploadDate":"2020-01-01","thumbnailUrl":{"@type":"ImageObject","url":"https://x/y.jpg"}}`;

describe("R5 · تنظيف بطاقات المصادر", () => {
  it("بقايا الكود (schema.org وJSON وHTML) تُكشف", () => {
    assert.ok(looksLikeCode(JSON_LD));
    assert.ok(looksLikeCode('<div class="x">نص</div>'));
    assert.ok(!looksLikeCode("الصلاة عمود الدين، وهي أول ما يحاسب عليه العبد يوم القيامة [البقرة: 43]."));
    assert.ok(!looksLikeCode(HADITH));
  });

  it("المقطع الذي فيه كود يُرفض، والنص السليم قبل ذيل الكود يبقى", () => {
    const dropped: { reason: string; source: string; title: string }[] = [];
    const kept = clean(
      [
        { title: "صفة الصلاة", text: JSON_LD, url: "https://islamhouse.com/ar/videos/1", source: "IslamHouse", sourceId: "islamhouse" },
        { title: "الوضوء", text: `الوضوء شرط لصحة الصلاة، ويبدأ بالنية ثم غسل الكفين ثلاثاً. ${JSON_LD}`, url: "https://islamhouse.com/ar/articles/2", source: "IslamHouse", sourceId: "islamhouse" },
      ],
      dropped,
    );
    assert.equal(kept.length, 1);
    assert.doesNotMatch(kept[0].text, /uploadDate|ImageObject|schema/);
    assert.equal(dropped[0].reason, "code");
    assert.equal(stripCode(`نص سليم قصير ${JSON_LD}`), "");
  });

  it("تسميات الحديث بلغة الواجهة: Narrator ← الراوي، Grade ← الدرجة، Explanation ← الشرح", () => {
    const ar = JSON.parse(read("messages/ar.json")).chat.labels;
    const text = "Narrator: Abu Hurairah\nGrade: Sahih\nExplanation: الحديث يدل على فضل الصلاة.\n**Benefits:** الإخلاص.";
    const out = localizeLabels(text, ar);
    assert.equal(out, "الراوي: Abu Hurairah\nالدرجة: Sahih\nالشرح: الحديث يدل على فضل الصلاة.\n**الفوائد:** الإخلاص.");
    // النص بعد التسمية حرفي، والكلمة في وسط السطر لا تُمس.
    assert.equal(localizeLabels("قال: Grade ليست تسمية هنا", ar), "قال: Grade ليست تسمية هنا");
    for (const l of ["ar", "en", "id", "ur", "bn", "tr", "fa", "fr", "ms", "ru", "sw", "ha"]) {
      const labels = JSON.parse(read(`messages/${l}.json`)).chat.labels;
      for (const k of LABEL_KEYS) assert.ok(labels?.[k], `${l}.chat.labels.${k}`);
    }
  });

  it("بطاقة «فتوى منشورة» بلا نص لا تُعرض إلا برابط صالح", () => {
    assert.equal(showFatwaCard({ excerpt: "", url: "https://islamqa.info/ar/answers/1" }), true);
    assert.equal(showFatwaCard({ excerpt: "", url: "" }), false);
    assert.equal(showFatwaCard({ excerpt: "", url: "javascript:alert(1)" }), false);
    assert.equal(showFatwaCard({ excerpt: JSON_LD, url: "not a url" }), false);
    assert.equal(fatwaExcerpt(JSON_LD), "");
    assert.equal(showFatwaCard({ excerpt: "نص الجواب حرفياً.", url: "" }), true);
    assert.ok(validUrl("https://binbaz.org.sa/fatwas/1") && !validUrl("https://localhost"));
  });
});

// ---------------------------------------------------------------------------
// 5) صفحة الفحص
// ---------------------------------------------------------------------------

describe("R5 · «شغّل الكل»: زمن كل مرحلة و«فحص الشخصية»", () => {
  const page = read("app/api/admin/sources-probe/route.ts");
  it("الأعمدة الجديدة، وسؤال الصلاة للمرشد", () => {
    for (const col of ["<th>التصنيف</th>", "<th>السريعة</th>", "<th>الويب</th>", "<th>الترتيب</th>", "<th>أول كلمة</th>", "<th>الصياغة</th>", "<th>فحص الشخصية</th>"]) {
      assert.ok(page.includes(col), col);
    }
    assert.match(page, /persona: r\.kind === "answer" \? personaIssues\(r\.text\) : \[\]/);
    assert.match(page, /\["المرشد","كيف أصلي خطوة بخطوة؟","new_muslim"\]/);
    assert.match(page, /\["الداعية · شبهة","هل انتشر الإسلام بالسيف؟","discover"\]/);
  });
});
