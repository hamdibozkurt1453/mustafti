/**
 * R5b بلا شبكة: اكتمال الجواب العملي (القوائم والبحوث الفرعية والاكتمال)، والجواب بغير العربية،
 * وتصنيف سؤال الإرشاد العام (ليس D)، والسرعة (القطع المتكيف، ولا انتظار للويب مع آية مطابقة).
 *   npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";

import type { Classification } from "../lib/brain/classify";
import { checkAnswer, repairAnswer } from "../lib/brain/guard";
import { looksGuidance, looksPersonal } from "../lib/brain/heuristics";
import { CHECKLISTS, checklistBlock, checklistCoverage, hasEvidence, mapChecklist, matchChecklist } from "../lib/brain/howto-checklists";
import { CLASSIFY_SYSTEM } from "../lib/brain/prompts";
import type { PinDeps } from "../lib/brain/retrieval";
import type { McpItem } from "../lib/sources/mcp-search";

process.env.OPENROUTER_API_KEY = "test";
process.env.LLM_MODEL = "test-model";
process.env.MCP_URL = "http://127.0.0.1:9/mcp";
process.env.FEATURE_WEB_TOOLS = "false";
delete process.env.LLM_FALLBACK_MODEL;
delete process.env.LLM_REASONING;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// ---------------------------------------------------------------------------
// نموذج وهمي
// ---------------------------------------------------------------------------

let level = "B";
let lang = "ar";
let answers: string[] = [];
const bodies: { name: string; body: Record<string, unknown> }[] = [];
const json = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }], usage: {} }), { status: 200 });

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
          lang,
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
    return json(answers[Math.min(n - 1, answers.length - 1)] ?? "");
  }
  const u = new URL(url);
  if (u.hostname === "api.quranpedia.net") {
    const path = decodeURIComponent(u.pathname);
    return new Response(path.endsWith("/fatwas") ? read("tests/fixtures/quranpedia-fatwas.json") : "{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }
  throw new TypeError("fetch failed");
}) as typeof fetch;

let brain: typeof import("../lib/brain/respond");
let retrieval: typeof import("../lib/brain/retrieval");
before(async () => {
  brain = await import("../lib/brain/respond");
  retrieval = await import("../lib/brain/retrieval");
});

const C = (over: Partial<Classification> = {}): Classification => ({
  lang: "ar",
  userType: "muslim",
  level: "A",
  urgent: false,
  outOfScope: false,
  aboutMustafti: false,
  needsClarification: false,
  searchQueries: { ar: ["أولو العزم"], userLang: [] },
  ...over,
});

const deps = (over: Partial<PinDeps> = {}): PinDeps => ({
  quranRange: async () => [],
  searchCorpus: async () => [],
  searchAny: async () => [],
  detail: async () => null,
  bayyinatSearch: async () => [],
  bayyinatNumbers: async () => [],
  sourceSearch: async () => [],
  mcpExtra: async () => [],
  islamqa: async () => [],
  web: () => new Promise(() => {}),
  ...over,
});

// ---------------------------------------------------------------------------
// ب2) التصنيف: سؤال الإرشاد العام ليس D
// ---------------------------------------------------------------------------

describe("R5b · سؤال الإرشاد العام B لا D (ولو ذكر السائل نفسه أو والديه)", () => {
  const guidance = [
    "My parents are Christian. How should I treat them now that I am Muslim?",
    "How can I be kind to my non-Muslim mother?",
    "كيف أتعامل مع والديّ النصرانيين بعد إسلامي؟",
    "أسلمت حديثاً وأمي مسيحية، كيف أبرّها؟",
    "كيف أصلي خطوة بخطوة؟",
    "Namaz nasıl kılınır?",
  ];
  for (const q of guidance) {
    it(`إرشاد عام: ${q}`, () => {
      assert.equal(looksPersonal(q), false, "ليس طلب حكم على حالة");
      assert.equal(looksGuidance(q), true);
    });
  }

  const personal = [
    "Can I eat pork if I am hungry?",
    "Is my prayer valid if I forgot wudu?",
    "هل يجوز لي أن أفطر في السفر؟",
    "طلقت زوجتي وأنا غاضب، كيف أتصرف؟",
    "صلاتي صحيحة إن نسيت الفاتحة؟",
    "كيف أقضي الصلوات التي تركتها عشر سنين؟",
  ];
  for (const q of personal) {
    it(`حالة شخصية تبقى كما هي: ${q}`, () => assert.equal(looksGuidance(q), false));
  }

  it("تعليمات المصنّف: سؤال الكيفية والتعامل B، وD للوقائع التي يختلف حكمها بتفاصيلها", () => {
    assert.match(CLASSIFY_SYSTEM, /HOW-TO or CONDUCT question/);
    assert.match(CLASSIFY_SYSTEM, /My parents are Christian/);
  });

  it("المصنّف قال D ← الكود يعيده B ويُجاب (new_muslim)", async () => {
    level = "D";
    lang = "en";
    answers = ["Be kind and dutiful to them; Allah commands good companionship with parents in this world [1]."];
    bodies.length = 0;
    const r = await brain.respond("My parents are Christian. How should I treat them now that I am Muslim?", { mode: "new_muslim" });
    level = "B";
    lang = "ar";
    assert.ok(r.overrides.includes("level:D->B:guidance"), r.overrides.join());
    assert.equal(r.classification?.level, "B");
    assert.notEqual(r.kind, "referral");
  });

  it("«الأساسيات»: بر الوالدين غير المسلمين (لقمان 14-15) يطابق بالعربية والإنجليزية", async () => {
    const { matchBasics } = await import("../lib/brain/basics");
    const en = matchBasics("My parents are Christian. How should I treat them now that I am Muslim?");
    const ar = matchBasics("كيف أتعامل مع والدي النصراني بعد إسلامي؟");
    assert.equal(en[0]?.id, "parents_non_muslim");
    assert.equal(ar[0]?.id, "parents_non_muslim");
    assert.ok(en[0].verses.includes("31:14-15"));
  });
});

// ---------------------------------------------------------------------------
// ب1) الجواب بغير العربية لا يُرفض
// ---------------------------------------------------------------------------

const WUDU_HADITH = "عن أبي هريرة رضي الله عنه قال: قال رسول الله ﷺ: «لا تقبل صلاة أحدكم إذا أحدث حتى يتوضأ». الدرجة: صحيح";
const WUDU_VERSE = "﴿يَا أَيُّهَا الَّذِينَ آمَنُوا إِذَا قُمْتُمْ إِلَى الصَّلَاةِ فَاغْسِلُوا وُجُوهَكُمْ﴾ [المائدة: 6]";

describe("R5b · الجواب التركي والإنجليزي: الاقتباس العربي المطابق مقبول، والمعنى بلا «» ليس اقتباساً", () => {
  const TR = `Namazın şartları şunlardır:
1. Abdestli olmak: Namazın geçerli olması için abdest şarttır [1]. Peygamberimiz (s.a.v.) şöyle buyurdu: «لا تقبل صلاة أحدكم إذا أحدث حتى يتوضأ» [1] — Anlam tercümesi: Sizden biri abdesti bozulduğunda abdest alıncaya kadar namazı kabul olunmaz.
2. Allah Teâlâ şöyle buyurur: ﴿يَا أَيُّهَا الَّذِينَ آمَنُوا إِذَا قُمْتُمْ إِلَى الصَّلَاةِ فَاغْسِلُوا وُجُوهَكُمْ﴾ [2], yani “Ey iman edenler, namaza kalktığınızda yüzlerinizi yıkayın” [2].`;

  it("«Namazın şartları»: لا اعتراض (كان «Namazın geçerli…» يُعدّ فتوى شخصية)", () => {
    const ctx = { sources: [WUDU_HADITH, WUDU_VERSE], lang: "tr" };
    assert.deepEqual(checkAnswer(TR, ctx).findings, []);
    const r = repairAnswer(TR, ctx);
    assert.deepEqual(r.blocked, []);
    assert.deepEqual(r.fixes, []);
  });

  it("الفتوى الشخصية التركية الصريحة تبقى ممنوعة", () => {
    assert.ok(repairAnswer("Namazınız geçersizdir [1].", { sources: [WUDU_HADITH], lang: "tr" }).blocked.length);
  });

  it("الإنجليزية: الآية بالعربية مطابقة، والمعنى بين علامات اقتباس إنجليزية مع [n] صياغة لا اقتباس", () => {
    const EN = `Wudu is required before prayer [1]. Allah says: ﴿يَا أَيُّهَا الَّذِينَ آمَنُوا إِذَا قُمْتُمْ إِلَى الصَّلَاةِ فَاغْسِلُوا وُجُوهَكُمْ﴾ — "O you who believe, when you rise to pray, wash your faces" [2].`;
    const ctx = { sources: [WUDU_HADITH, WUDU_VERSE], lang: "en" };
    assert.deepEqual(checkAnswer(EN, ctx).findings, []);
    // نسبة حديث بنص إنجليزي بلا عربي موثَّق: تُحذف العلامات والنسبة ويبقى المعنى (R5c، كانت جملته تُحذف).
    const fake = `The Prophet said: "Drinking tea after Fajr increases faith" [1]. May Allah bless you.`;
    assert.equal(repairAnswer(fake, ctx).text, "It is reported in the Sunnah, in meaning: Drinking tea after Fajr increases faith [1]. May Allah bless you.");
  });

  it("respond بالتركية: جواب لا رفض", async () => {
    lang = "tr";
    answers = [TR.replace(/\[2\]/g, "[1]")];
    const r = await brain.respond("Namazın şartları nelerdir? (R5b)");
    lang = "ar";
    assert.equal(r.kind, "answer", `${r.diag.abstainReason} ${JSON.stringify(r.diag.attempts.map((a) => a.findings))}`);
  });
});

// ---------------------------------------------------------------------------
// أ) القوائم العملية
// ---------------------------------------------------------------------------

describe("R5b · قوائم العناصر الواجبة للأسئلة العملية", () => {
  it("المطابقة: الصلاة والوضوء والغسل والصيام والشهادتان، بلغات عدة؛ و«شروط الصلاة» ليست «كيف أصلي»", () => {
    const cases: [string, string | null][] = [
      ["كيف أصلي خطوة بخطوة؟", "salah"],
      ["How do I pray?", "salah"],
      ["Namaz nasıl kılınır?", "salah"],
      ["كيف أتوضأ خطوة بخطوة؟", "wudu"],
      ["How to make wudu?", "wudu"],
      ["كيف أغتسل من الجنابة؟", "ghusl"],
      ["كيف أصوم رمضان؟", "siyam"],
      ["ما معنى الشهادتين؟", "shahada"],
      ["How do I become a Muslim?", "shahada"],
      ["Namazın şartları nelerdir?", null],
      ["ما حكم صلاة الجماعة؟", null],
    ];
    for (const [q, id] of cases) assert.equal(matchChecklist(q)?.id ?? null, id, q);
    assert.deepEqual(CHECKLISTS.map((c) => c.id), ["salah", "wudu", "ghusl", "siyam", "shahada"]);
  });

  it("قائمة الصلاة تشمل الاستفتاح والركوع والرفع والسجود والجلسة والتشهد والتسليم وعدد الركعات", () => {
    const ids = matchChecklist("كيف أصلي؟")!.items.map((i) => i.id);
    for (const id of ["takbir", "istiftah", "fatiha", "ruku", "rafa", "sujud", "jalsa", "tashahhud", "salawat", "taslim", "rakat"]) assert.ok(ids.includes(id), id);
  });

  it("ربط العناصر بالنصوص بدليلها في النص، والقائمة تذكير لا بوابة (R5c): العنصر بلا نص يُكتب من العلم", () => {
    const list = matchChecklist("كيف أصلي؟")!;
    const passages = [
      { text: "كان النبي ﷺ يقول في ركوعه: «سبحان ربي العظيم»، وفي سجوده: «سبحان ربي الأعلى». الدرجة: صحيح" },
      { text: "قال ﷺ: «مفتاح الصلاة الطهور، وتحريمها التكبير، وتحليلها التسليم». الدرجة: صحيح" },
    ];
    const mapping = mapChecklist(list, passages);
    const at = (id: string) => mapping.find((m) => m.item.id === id)!.passages;
    assert.deepEqual(at("ruku"), [1]);
    assert.deepEqual(at("sujud"), [1]);
    assert.deepEqual(at("takbir"), [2]);
    assert.deepEqual(at("istiftah"), []);
    const block = checklistBlock(list, mapping, "ar");
    assert.match(block, /ITEMS TO COVER/);
    assert.match(block, /REMINDER so your answer is complete/);
    assert.match(block, /Bowing \(ruku'\) and its dhikr \(الركوع وذكره\) — passages \[1\]/);
    assert.match(block, /Opening supplication \(دعاء الاستفتاح\) — has words to say — from your knowledge \(no passage number\)/);
    assert.doesNotMatch(block, /NO PASSAGE|do not write this item|never invent it|Never write words to say that no passage contains/);
    assert.match(block, /\*\*قبل الصلاة\*\*/);
    assert.match(block, /«ماذا تفعل»/);
    assert.doesNotMatch(block, /transliteration/);
    assert.match(checklistBlock(list, mapping, "en"), /Latin transliteration and then the meaning/);
  });

  it("الاكتمال: نسبة العناصر المذكورة في الجواب (بلا مطابقة «salam» داخل «islam»)", () => {
    const list = matchChecklist("كيف أتوضأ؟")!;
    const full =
      "1. انوِ بقلبك. 2. قل «بسم الله». 3. اغسل كفيك. 4. تمضمض واستنشق. 5. اغسل الوجه. 6. اغسل يديك إلى المرفقين. 7. امسح رأسك. 8. امسح الأذنين. 9. اغسل رجليك إلى الكعبين. 10. ثم قل: «أشهد أن لا إله إلا الله».";
    assert.equal(checklistCoverage(list, full).ratio, 1);
    const half = checklistCoverage(list, "اغسل الوجه، وامسح رأسك، واغسل رجليك.");
    assert.ok(half.ratio < 0.5 && half.missing.includes("tasmiya"));
    const salah = matchChecklist("How do I pray?")!;
    assert.ok(!checklistCoverage(salah, "Welcome to Islam.").covered.includes("taslim"));
  });

  it("البحوث الفرعية: نص العنصر يُقبل بدليله (درجة 85 بلا نموذج)، وما لا دليل فيه يسقط", async () => {
    const list = matchChecklist("كيف أصلي؟")!;
    const asked: string[] = [];
    const items = (q: string): McpItem[] =>
      q.includes("سبحان ربي العظيم")
        ? [{ title: "حديث حذيفة", text: "فكان يقول في ركوعه: سبحان ربي العظيم، وفي سجوده: سبحان ربي الأعلى", url: "https://hadeethenc.com/ar/browse/hadith/1", grade: "صحيح" }]
        : q.includes("سبحانك اللهم")
          ? [{ title: "حديث آخر", text: "من قال لا إله إلا الله دخل الجنة", url: "https://hadeethenc.com/ar/browse/hadith/2", grade: "صحيح" }]
          : [];
    const found = await retrieval.checklistCandidates(
      list,
      deps({
        searchCorpus: async (q) => {
          asked.push(q);
          return items(q);
        },
      }),
      [],
      () => 30_000,
    );
    assert.ok(asked.length >= 8, "بحث لكل عنصر فيه ذكر");
    assert.equal(found.length, 1, "حديث الاستفتاح بلا دليله سقط");
    assert.equal(found[0].checklistItem, "ruku");
    assert.equal(found[0].score, retrieval.CHECKLIST_SCORE);
    assert.ok(hasEvidence(list.items.find((i) => i.id === "sujud")!, found[0].text), "النص نفسه دليل السجود أيضاً");
  });

  it("respond: «العناصر المطلوب تغطيتها» في تعليمات الصياغة، و«الاكتمال» في الرد (المرشد)", async () => {
    answers = ["لا تقلق، ستتعلمها خطوة خطوة. **قبل الصلاة**\n1. ماذا تفعل: توضأ [1]. وصلّ ركعتين [1].\nبارك الله فيك."];
    bodies.length = 0;
    const r = await brain.respond("كيف أصلي خطوة بخطوة؟ (R5b)", { mode: "new_muslim" });
    assert.equal(r.kind, "answer", r.diag.abstainReason);
    const system = String((bodies.find((b) => b.name === "chat")!.body.messages as { content: string }[])[0].content);
    assert.match(system, /ITEMS TO COVER — «صفة الصلاة»/);
    assert.match(system, /«ماذا تفعل:»/, "شكل جواب المرشد");
    assert.equal(r.checklist?.id, "salah");
    assert.ok(r.checklist!.covered.includes("taharah") && r.checklist!.covered.includes("rakat"));
    assert.ok(r.checklist!.missing.includes("istiftah"));
    // حد رموز أعلى للجواب العملي الكامل.
    assert.ok(Number(bodies.find((b) => b.name === "chat")!.body.max_tokens) >= 2600);
  });

  it("«الداعية» بلا قائمة عملية", async () => {
    answers = ["الصلاة عبادة يقف فيها المسلم بين يدي ربه [1]."];
    bodies.length = 0;
    const r = await brain.respond("كيف أصلي؟ (discover R5b)", { mode: "discover" });
    assert.equal(r.checklist, undefined);
  });
});

// ---------------------------------------------------------------------------
// ب3) السرعة
// ---------------------------------------------------------------------------

const strongFatwa = (i: number) => ({
  title: `شروط صحة الصلاة ${i}`,
  text: `من شروط صحة الصلاة الطهارة واستقبال القبلة ودخول الوقت وستر العورة، وهذه شروط صحة الصلاة عند أهل العلم (الفتوى ${i}).`,
  url: `https://islamqa.info/ar/answers/${100 + i}`,
  source: "الإسلام سؤال وجواب",
  sourceId: "islamqa" as const,
  lang: "ar",
});

describe("R5b · السرعة", () => {
  it("قطع متكيف: مصدر بطيء لا يُنتظر حتى 4.5 ث إن وصل ما يكفي، وزمن كل مصدر مسجّل", async () => {
    const t0 = Date.now();
    const r = await retrieval.retrieve(C({ searchQueries: { ar: ["شروط صحة الصلاة"], userLang: [] } }), "ما شروط صحة الصلاة؟", undefined, {
      deps: deps({
        islamqa: async () => [1, 2, 3, 4, 5, 6].map(strongFatwa),
        sourceSearch: () => new Promise(() => {}),
      }),
      deadline: Date.now() + 55_000,
    });
    const st = r.diag.stages!;
    assert.ok(st.fastMs < retrieval.FAST_MIN_MS, `fastMs ${st.fastMs}`);
    assert.ok(st.fastMs >= retrieval.FAST_FLOOR_MS - 50);
    assert.equal(st.fastJobs?.published, null, "Quranpedia لم يكتمل فلم يُنتظر");
    assert.equal(typeof st.fastJobs?.islamqa, "number");
    assert.equal(st.earlyExit, true);
    assert.ok(Date.now() - t0 < 6_000);
  });

  it("آية محددة مطابقة (≥ 80) تكفي: لا انتظار لطبقة الويب", async () => {
    const VERSE = [
      '[Surah 46, translation "arabic_moyassar"]',
      "[46:35]",
      "فَٱصۡبِرۡ كَمَا صَبَرَ أُوْلُواْ ٱلۡعَزۡمِ مِنَ ٱلرُّسُلِ",
      "فاصبر -أيها الرسول- كما صبر أولو العزم من الرسل من قبلك",
    ].join("\n");
    const plan = Promise.resolve({ quran: [{ surah: 46, ayah: 35 }], surahInfo: [], quranIndex: false, quranQueries: [], hadithQueries: [], bayyinatQueries: [] });
    const t0 = Date.now();
    const r = await retrieval.retrieve(C(), "من هم أولو العزم من الرسل؟", plan, {
      deps: deps({
        quranRange: async (s, a) => (s === 46 && a === 35 ? [{ title: "الأحقاف 46:35", text: VERSE, url: "https://quranenc.com/ar/browse/arabic_moyassar/46#35" }] : []),
      }),
      deadline: Date.now() + 55_000,
    });
    assert.equal(r.diag.stages?.earlyExit, true);
    assert.equal(r.diag.stages?.webSkipped, "pinned");
    assert.ok(r.passages.some((p) => /أولو العزم|أُوْلُواْ/.test(p.text)));
    assert.ok(Date.now() - t0 < 10_000, "لم تُنتظر «ابحث واقرأ» (35 ث)");
  });

  it("تخطّي الترتيب موسَّع: مرشحان واضحان يكفيان", async () => {
    const rank = await import("../lib/brain/rank");
    assert.equal(rank.CLEAR_MIN, 2);
    assert.ok(rank.CLEAR_KW <= 5 && rank.CLEAR_COVERAGE <= 0.67);
  });
});

// ---------------------------------------------------------------------------
// الواجهة وصفحة الفحص
// ---------------------------------------------------------------------------

describe("R5b · البطاقات و«شغّل الكل»", () => {
  it("الحديث يُطوى في «المرشد»، ومادة المكتبة بزر «فتح / تحميل» بكل اللغات", () => {
    const card = read("components/chat/SourceCard.tsx");
    assert.match(card, /foldHadith && source\.kind === "hadith"/);
    assert.match(card, /source\.kind === "library" \? t\("openDownload"\)/);
    assert.match(read("components/chat/BotReply.tsx"), /foldHadith=\{caseApi\.mode === "new_muslim"\}/);
    assert.match(read("app/api/chat/route.ts"), /kind: "library"/);
    for (const l of ["ar", "en", "id", "ur", "bn", "tr", "fa", "fr", "ms", "ru", "sw", "ha"]) {
      const chat = JSON.parse(read(`messages/${l}.json`)).chat;
      assert.ok(chat.openDownload && chat.showText, l);
    }
    assert.equal(JSON.parse(read("messages/ar.json")).chat.openDownload, "فتح / تحميل");
  });

  it("عمودا «اكتمال» و«زمن كل مصدر سريع»", () => {
    const page = read("app/api/admin/sources-probe/route.ts");
    assert.ok(page.includes("<th>اكتمال</th>") && page.includes("<th>زمن كل مصدر سريع</th>"));
    assert.match(page, /checklist: r\.checklist \?/);
    assert.match(page, /st\.fastJobs/);
  });
});
