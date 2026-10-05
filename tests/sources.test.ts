/**
 * موصّلا Quranpedia والدرر بردود نموذجية مسجّلة (tests/fixtures/)، بلا شبكة: fetch مستبدل.
 * وفلتر نطاقات الفتاوى، والمهلة، والذاكرة المؤقتة، ومصادر نوع السؤال، وشجرة أبواب الأذكار.
 *   npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";

import { classifyCategory } from "../lib/adhkar/rules";
import { exploreCategories, MAIN_CATEGORIES, treeLines } from "../lib/adhkar/tree";
import { fatwaExcerpt, toFatwaCard } from "../lib/brain/fatwa-cards";
import type { Classification } from "../lib/brain/classify";

process.env.OPENROUTER_API_KEY = "test";
process.env.LLM_MODEL = "test-model";
process.env.MCP_URL = "http://127.0.0.1:9/mcp";
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

/** الطلبات الصادرة (الرابط وUser-Agent)، والردود حسب المسار. */
const requests: { url: string; ua: string }[] = [];
let hang = false;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const ua = new Headers(init?.headers).get("User-Agent") ?? "";
  requests.push({ url, ua });
  if (hang && /quranpedia|dorar/.test(url)) return new Promise<Response>(() => {});
  const json = (body: string) => new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
  const u = new URL(url);
  if (u.hostname === "api.quranpedia.net") {
    const path = decodeURIComponent(u.pathname);
    if (path.endsWith("/fatwas")) return json(path.includes("طلاق") ? fixture("quranpedia-divorce.json") : fixture("quranpedia-fatwas.json"));
    if (path.endsWith("/options")) return json(fixture("quranpedia-options.json"));
    if (/\/book\/\d+$/.test(path)) return json(fixture("quranpedia-tafsir.json"));
    if (path.endsWith("/topics")) return json(JSON.stringify({ data: [{ id: 9, ar_title: "الصلاة", ar_description: "موضوع الصلاة في القرآن" }, { ar_title: "بلا معرّف" }] }));
    return json("{}");
  }
  if (u.hostname === "dorar.net" && u.pathname === "/dorar_api.json") return json(fixture("dorar.json"));
  if (url.includes("openrouter.ai")) return json(JSON.stringify({ choices: [{ message: { content: "{}" } }], usage: {} }));
  return new Response("not found", { status: 404 });
}) as typeof fetch;

let qp: typeof import("../lib/sources/quranpedia");
let dorar: typeof import("../lib/sources/dorar");
let sources: typeof import("../lib/sources");
let retrieval: typeof import("../lib/brain/retrieval");
before(async () => {
  qp = await import("../lib/sources/quranpedia");
  dorar = await import("../lib/sources/dorar");
  sources = await import("../lib/sources");
  retrieval = await import("../lib/brain/retrieval");
});

describe("فلتر نطاقات الفتاوى (المرجعية فقط)", () => {
  it("يقبل النطاقات الخمسة ونطاقاتها الفرعية", () => {
    for (const url of [
      "https://islamqa.info/ar/answers/1",
      "https://www.islamqa.info/ar/answers/1",
      "https://binbaz.org.sa/fatwas/1",
      "http://binothaimeen.net/content/1",
      "https://islamhouse.com/ar/fatwa/1",
      "https://dorar.net/feqhia/1",
    ]) {
      assert.equal(qp.isReferenceFatwaUrl(url), true, url);
    }
  });

  it("يستبعد كل نطاق آخر، ولو شابه نطاق المرجعية في الاسم أو المسار", () => {
    for (const url of [
      "https://ar.islamway.net/fatwa/1",
      "https://islamway.net/fatwa/1",
      "https://islamqa.info.evil.example/ar/answers/1",
      "https://evilislamqa.info/x",
      "https://example.com/?u=https://islamqa.info/ar/answers/1",
      "javascript:alert(1)",
      "islamqa.info/ar/answers/1",
      "",
      undefined,
    ]) {
      assert.equal(qp.isReferenceFatwaUrl(url), false, String(url));
    }
  });
});

describe("Quranpedia: الفتاوى بردود مسجّلة", () => {
  it("يحلل الرد المغلّف، ويبقي فتاوى المرجعية وحدها، ويتحمل الحقول الناقصة", () => {
    const fatwas = qp.parseFatwas(JSON.parse(fixture("quranpedia-fatwas.json")));
    assert.deepEqual(
      fatwas.map((f) => f.url),
      ["https://islamqa.info/ar/answers/12345", "https://binbaz.org.sa/fatwas/2233/حكم-تاخير-الصلاة", "https://binothaimeen.net/content/777"],
    );
    const [first, second, third] = fatwas;
    assert.equal(first.title, "قضاء صلاة الفجر بعد طلوع الشمس");
    assert.equal(first.mufti, "الإسلام سؤال وجواب"); // المفتي كائناً
    assert.equal(first.category, "الصلاة");
    assert.doesNotMatch(first.answer, /<p>|<\/p>/); // بلا وسوم HTML
    assert.match(first.answer, /^الحمد لله\. من نام عن صلاة الفجر/);
    assert.equal(second.mufti, "الشيخ عبدالعزيز بن باز"); // المفتي نصاً
    // بلا عنوان ولا مفتي: العنوان من السؤال، والجهة من النطاق.
    assert.equal(third.title, "متى يبدأ وقت صلاة الفجر؟");
    assert.equal(third.mufti, "موقع الشيخ محمد بن صالح العثيمين");
    assert.equal(third.host, "binothaimeen.net");
    assert.ok(fatwas.every((f) => !/islamway|evil/.test(f.url)));
  });

  it("رد فارغ أو غريب لا يرمي", () => {
    for (const data of [null, {}, [], "نص", { data: null }, { data: [{ ar_title: 5 }] }]) assert.deepEqual(qp.parseFatwas(data), []);
  });

  it("search(«quranpedia») بالواجهة الموحدة: User-Agent باسم mustafti.com، ونتائج بنوع «فتوى»، وذاكرة 24 ساعة", async () => {
    requests.length = 0;
    const results = await sources.search("quranpedia", "قضاء صلاة الفجر", "ar");
    assert.equal(results.length, 3);
    assert.ok(results.every((r) => r.sourceId === "quranpedia" && r.fatwa && r.fatwa.answer.length > 20));
    assert.match(results[0].source, /^فتوى منشورة — الإسلام سؤال وجواب$/);
    const call = requests.find((r) => r.url.startsWith("https://api.quranpedia.net/v1/search/"));
    assert.ok(call, "طلب إلى api.quranpedia.net");
    assert.match(call!.url, /\/fatwas$/);
    assert.match(call!.ua, /mustafti\.com/);
    // الطلب الثاني من الذاكرة المؤقتة.
    requests.length = 0;
    await sources.search("quranpedia", "قضاء صلاة الفجر", "ar");
    assert.equal(requests.filter((r) => r.url.includes("quranpedia")).length, 0);
  });

  it("التفسير: خيارات الآية ثم أفضل كتاب (الميسر قبل ابن كثير)، بلا وسوم", async () => {
    const [t] = await qp.ayahTafsir(2, 255);
    assert.match(t.title, /^التفسير الميسر — 2:255$/);
    assert.match(t.text, /^الله الذي لا يستحق العبادة إلا هو/);
    assert.equal(t.url, "https://quranpedia.net/book/7");
    assert.ok(requests.some((r) => r.url.endsWith("/ayah/2/255/book/7")));
  });

  it("الموضوعات: العنوان والوصف، والرابط من المعرّف", async () => {
    const items = await qp.searchItems("الصلاة", "topics");
    assert.equal(items[0].title, "الصلاة");
    assert.equal(items[0].text, "موضوع الصلاة في القرآن");
    assert.equal(items[0].url, "https://quranpedia.net/topic/9");
  });
});

describe("الدرر السنية: الحديث بحقوله والحكم حرفياً", () => {
  it("يحلل الـ HTML إلى حقول، ويحذف رقم النتيجة ووسوم التظليل، ويسقط الحديث بلا حكم", () => {
    const hadiths = dorar.parseDorarHtml(dorar.dorarResultHtml(JSON.parse(fixture("dorar.json"))), "إنما الأعمال");
    assert.equal(hadiths.length, 2);
    const [a, b] = hadiths;
    assert.equal(a.text, "إنما الأعمالُ بالنِّيَّاتِ، وإنما لكلِّ امرئٍ ما نوى");
    assert.equal(a.rawi, "عمر بن الخطاب");
    assert.equal(a.muhaddith, "البخاري");
    assert.equal(a.book, "صحيح البخاري");
    assert.equal(a.page, "1");
    assert.equal(a.grade, "[صحيح]"); // حرفياً كما في الموقع
    assert.equal(b.grade, "باطل لا أصل له");
    assert.equal(b.page, "1/382");
    assert.equal(a.url, "https://dorar.net/hadith/search?q=%D8%A5%D9%86%D9%85%D8%A7%20%D8%A7%D9%84%D8%A3%D8%B9%D9%85%D8%A7%D9%84#1");
    assert.notEqual(a.url, b.url);
  });

  it("رد فارغ أو بلا ahadith لا يرمي", () => {
    for (const data of [null, {}, { ahadith: {} }, { ahadith: { result: "" } }, "<p>لا شيء</p>"]) {
      assert.deepEqual(dorar.parseDorarHtml(dorar.dorarResultHtml(data), "x"), []);
    }
  });

  it("search(«dorar_hadith») بالواجهة الموحدة: الدرجة والمصدر في النتيجة، والرابط صفحة البحث", async () => {
    requests.length = 0;
    const results = await sources.search("dorar_hadith", "اطلبوا العلم ولو بالصين", "ar");
    assert.equal(results.length, 2);
    assert.equal(results[1].grade, "باطل لا أصل له");
    assert.match(results[1].text, /خلاصة حكم المحدث: باطل لا أصل له/);
    assert.match(results[0].source, /^الدرر السنية — الموسوعة الحديثية \(البخاري، صحيح البخاري، 1\)$/);
    const call = requests.find((r) => r.url.startsWith("https://dorar.net/dorar_api.json?skey="));
    assert.ok(call);
    assert.match(call!.ua, /mustafti\.com/);
  });
});

describe("المهلة: المصدر البطيء يسقط ولا يُنتظر", () => {
  it("search بمهلة قصيرة يعيد [] فوراً إن لم يرد المصدر", async () => {
    hang = true;
    try {
      const t0 = Date.now();
      const results = await sources.search("quranpedia", "سؤال لم يُخزَّن بعد", "ar", 80);
      assert.deepEqual(results, []);
      assert.ok(Date.now() - t0 < 1_000, `${Date.now() - t0}ms`);
    } finally {
      hang = false;
    }
  });
});

describe("مصادر نوع السؤال", () => {
  const C = (ar: string[]): Classification => ({
    lang: "ar",
    userType: "unknown",
    level: "A",
    urgent: false,
    outOfScope: false,
    aboutMustafti: false,
    needsClarification: false,
    searchQueries: { ar, userLang: [] },
  });

  it("الفتاوى بأول 3 عبارات، والدرر بأول عبارة", () => {
    const jobs = retrieval.extraSearches(C(["قضاء الفجر", "النوم عن الصلاة", "الصلاة الفائتة", "عبارة رابعة"]), "ماذا يفعل من نام عن الفجر؟");
    assert.deepEqual(
      jobs.map((j) => `${j.source}:${j.q}`),
      ["quranpedia:قضاء الفجر", "quranpedia:النوم عن الصلاة", "quranpedia:الصلاة الفائتة", "dorar_hadith:قضاء الفجر"],
    );
  });

  it("التحقق من حديث: متن الحديث المنقول في السؤال أولاً في الدرر", () => {
    const q = "هل حديث «اطلبوا العلم ولو بالصين» صحيح؟";
    assert.equal(retrieval.looksHadithCheck(q), true);
    assert.equal(retrieval.quotedSegment(q), "اطلبوا العلم ولو بالصين");
    const dorarJobs = retrieval.extraSearches(C(["طلب العلم"]), q).filter((j) => j.source === "dorar_hadith");
    assert.deepEqual(dorarJobs.map((j) => j.q), ["اطلبوا العلم ولو بالصين", "طلب العلم"]);
    assert.equal(retrieval.looksHadithCheck("Is the hadith about seeking knowledge in China authentic?"), true);
    assert.equal(retrieval.looksHadithCheck("لماذا يصوم المسلمون؟"), false);
  });
});

describe("بطاقة الفتوى: مقتطف حرفي ≤ 400 حرف", () => {
  it("أول الجواب بحروفه، مقطوعاً عند مسافة، ثم «…»", () => {
    const answer = JSON.parse(fixture("quranpedia-divorce.json"))[0].ar_answer as string;
    const ex = fatwaExcerpt(answer);
    assert.ok(ex.length <= 401, String(ex.length));
    assert.ok(ex.endsWith("…"));
    assert.ok(answer.startsWith(ex.slice(0, -1)), "المقتطف جزء حرفي من أول الجواب");
    assert.equal(fatwaExcerpt("جواب قصير."), "جواب قصير.");
  });

  it("بلا جواب لا بطاقة", () => {
    assert.equal(toFatwaCard({ title: "x", url: "u" }), null);
  });
});

describe("الأذكار: الأبواب الفرعية تكرارياً حتى عمق 3", () => {
  it("يشترط «أذكار» مع الوقت", () => {
    assert.equal(classifyCategory("أذكار الصباح والمساء"), "morningEvening");
    assert.equal(classifyCategory("الأذكار بعد الصلاة"), "afterPrayer");
    assert.equal(classifyCategory("أذكار أدبار الصلوات"), "afterPrayer");
    assert.equal(classifyCategory("صلاة الصبح"), null);
    assert.equal(classifyCategory("فضل صلاة المساء"), null);
    assert.equal(classifyCategory("أذكار النوم"), null);
  });

  /** شجرة الموسوعة: البابان تحت «الفضائل والآداب» ← «الأذكار» ← «أذكار اليوم والليلة». */
  const TREE: Record<string, { id: string; title: string }[]> = {
    "4": [{ id: "40", title: "الصلاة" }],
    "40": [{ id: "400", title: "صفة الصلاة" }],
    "5": [{ id: "50", title: "الآداب" }, { id: "51", title: "الأذكار والأدعية" }],
    "51": [{ id: "510", title: "أذكار اليوم والليلة" }, { id: "511", title: "أدعية متفرقة" }],
    "510": [{ id: "5100", title: "أذكار الصباح والمساء" }, { id: "5101", title: "الأذكار بعد الصلاة" }],
  };

  it("يجد البابين في العمق 3، والأقرب إلى الأذكار أولاً، ويعرض الشجرة", async () => {
    const browsed: string[] = [];
    const { found, tree, calls } = await exploreCategories(MAIN_CATEGORIES, async (id) => {
      browsed.push(id);
      return TREE[id] ?? [];
    });
    assert.deepEqual(
      found.map((f) => `${f.id}:${f.kind}`),
      ["5100:morningEvening", "5101:afterPrayer"],
    );
    assert.equal(browsed[0], "5"); // «الفضائل والآداب» أولاً
    assert.ok(calls <= 10, String(calls));
    assert.equal(tree.find((n) => n.id === "5100")?.depth, 3);
    const lines = treeLines(tree);
    assert.ok(lines.some((l) => /^ {12}• أذكار الصباح والمساء \(5100\) ← أذكار الصباح والمساء$/.test(l)), lines.join("\n"));
  });

  it("لا ينزل أبعد من العمق 3، ولا يتجاوز حد الطلبات، والخطأ يُسجَّل في الشجرة", async () => {
    const deep: Record<string, { id: string; title: string }[]> = {
      "5": [{ id: "a", title: "الأذكار" }],
      a: [{ id: "b", title: "أذكار" }],
      b: [{ id: "c", title: "أذكار متفرقة" }],
      c: [{ id: "d", title: "أذكار الصباح والمساء" }],
    };
    const browsed: string[] = [];
    const { found, tree } = await exploreCategories(MAIN_CATEGORIES, async (id) => {
      browsed.push(id);
      if (id === "3") throw new Error("429");
      return deep[id] ?? [];
    });
    assert.deepEqual(found, []);
    assert.ok(!browsed.includes("c"), "العقدة في العمق 3 لا تُتصفح");
    assert.equal(tree.find((n) => n.id === "3")?.error, "429");
    const capped = await exploreCategories(MAIN_CATEGORIES, async () => [{ id: String(Math.random()), title: "باب" }], { maxCalls: 5 });
    assert.equal(capped.calls, 5);
  });
});
