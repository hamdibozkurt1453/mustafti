/**
 * R1d بلا شبكة: النص الحرفي من الصفحة يقتطعه الكود (لا اقتباس النموذج)، ومتانة الصيغة (لا JSON ←
 * إعادة قصيرة ← المحتوى المقروء)، والسريع أولاً (لا تُنتظر «ابحث واقرأ» إن كفى مصدران)، والحالة D.
 *   npm test
 */
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import type { Classification } from "../lib/brain/classify";
import type { PinDeps } from "../lib/brain/retrieval";
import type { WebResult } from "../lib/brain/web";
import { extractFetched, verifyWebAnswer, type FetchedPage } from "../lib/brain/web-parse";
import { keywords } from "../lib/brain/rank";
import type { SourceResult } from "../lib/sources/types";

process.env.OPENROUTER_API_KEY = "test";
process.env.LLM_MODEL = "test-model";
process.env.MCP_URL = "http://127.0.0.1:9/mcp";
delete process.env.LLM_FALLBACK_MODEL;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

/** صفحة مقروءة طويلة (أكثر من 600 حرف) فيها فقرة الجواب في وسطها. */
const LONG_PAGE = [
  "الإسلام سؤال وجواب — الرئيسية — الأقسام — البحث في الموقع وتصفح الفتاوى بحسب الموضوعات والأبواب الفقهية.",
  "السؤال: ما حكم الصلاة في الطائرة إذا خشي المسافر خروج الوقت قبل الهبوط؟",
  "الجواب: الحمد لله. إذا خشي المسافر خروج وقت الصلاة قبل هبوط الطائرة صلى فيها على حسب حاله، ويستقبل القبلة إن استطاع، ويصلي قائماً إن قدر، فإن عجز صلى جالساً.",
  "وقد سبق في أجوبة كثيرة بيان أحكام السفر وقصر الصلاة وجمعها، فلتراجع في مواضعها من الموقع، والله أعلم بالصواب وإليه المرجع والمآب.",
  "وقد اتفق أهل العلم على أن الصلاة لا تؤخر عن وقتها لغير عذر، وأن المسافر يصلي كما يستطيع، فإن الله لا يكلف نفساً إلا وسعها، وما جعل عليكم في الدين من حرج.",
  "روابط ذات صلة: أحكام المسافر · قصر الصلاة · الجمع بين الصلاتين · صلاة الجماعة في السفر · المسح على الخفين.",
].join("\n");

let replyMode: "json" | "nojson" | "nojson-retry-fails" = "json";
const sentBodies: Record<string, unknown>[] = [];
const RAW_PAGES = {
  choices: [
    {
      message: {
        role: "assistant",
        content: "",
        annotations: [{ type: "url_citation", url_citation: { url: "https://islamqa.info/ar/answers/777", title: "الصلاة في الطائرة", content: LONG_PAGE } }],
      },
    },
    { message: { role: "tool", content: JSON.stringify({ results: [{ url: "https://binbaz.org.sa/fatwas/9", title: "صلاة المسافر", snippet: "صلاة المسافر في الطائرة تصح إذا خاف خروج الوقت" }] }) } },
  ],
  usage: { cost: 0.01 },
};

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.includes("openrouter.ai")) return realFetch(input, init);
  const body = JSON.parse(String(init?.body ?? "{}"));
  sentBodies.push(body);
  const name = body.response_format?.json_schema?.name;
  const user = (body.messages as { role: string; content: string }[]).find((m) => m.role === "user")?.content ?? "";
  const ok = (content: string, extra: object = {}) =>
    new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content } }], usage: {}, ...extra }), { status: 200 });
  if (name === "relevance") {
    // «ذو صلة» في نص المرشح ← 90، وغيره 20.
    const blocks = user.split(/\n(?=\[S\d+\])/);
    const scores = blocks.flatMap((b) => {
      const id = b.match(/^\[(S\d+)\]/)?.[1];
      return id ? [{ id, score: /ذو صلة/.test(b) ? 90 : 20 }] : [];
    });
    return ok(JSON.stringify({ scores }));
  }
  const system = (body.messages as { role: string; content: string }[])[0]?.content ?? "";
  if (!body.tools && /up to 4 URLs from the list/.test(system)) {
    if (replyMode === "nojson-retry-fails") return ok("لا أستطيع");
    return ok(JSON.stringify({ queries: [], sources: [{ url: "https://islamqa.info/ar/answers/777", title: "الصلاة في الطائرة", site: "", quote: "" }], explanation: "" }));
  }
  if (body.tools) {
    const content =
      replyMode === "json"
        ? JSON.stringify({ queries: ["الصلاة في الطائرة"], sources: [{ url: "https://islamqa.info/ar/answers/777", title: "الصلاة في الطائرة", site: "", quote: "يجوز للمسافر أن يؤخر الصلاة حتى يهبط مطلقاً" }], explanation: "" })
        : "قرأت الصفحات ووجدت الجواب في islamqa.";
    const raw = structuredClone(RAW_PAGES);
    raw.choices[0].message.content = content;
    return new Response(JSON.stringify(raw), { status: 200 });
  }
  return ok("{}");
}) as typeof fetch;

let web: typeof import("../lib/brain/web");
let mod: typeof import("../lib/brain/retrieval");
before(async () => {
  web = await import("../lib/brain/web");
  mod = await import("../lib/brain/retrieval");
});

const QUESTION = "ما حكم الصلاة في الطائرة؟";

describe("النص الحرفي من الصفحة يقتطعه الكود (البند 3)", () => {
  it("أفضل فقرة لكلمات السؤال من الصفحة المقروءة، لا اقتباس النموذج المختلق", () => {
    const pages = extractFetched(RAW_PAGES);
    assert.equal(pages.find((p) => p.url.includes("777"))?.kind, "page");
    assert.equal(pages.find((p) => p.url.includes("binbaz"))?.kind, "snippet");
    const { sources } = verifyWebAnswer(
      { queries: [], explanation: "", sources: [{ url: "https://islamqa.info/ar/answers/777", title: "t", site: "", quote: "يجوز للمسافر أن يؤخر الصلاة حتى يهبط مطلقاً" }] },
      pages,
      undefined,
      keywords(`${QUESTION} المسافر خروج الوقت`),
    );
    const s = sources[0];
    assert.equal(s.status, "verified");
    assert.equal(s.match, "extracted");
    assert.ok(!s.quote!.includes("مطلقاً"), "اقتباس النموذج لا يُعرض");
    for (const part of s.quote!.split("\n")) assert.ok(LONG_PAGE.includes(part), `حرفي: ${part}`);
    assert.match(s.quote!, /صلى فيها على حسب حاله/);
    // الصفحة المقروءة التي لم يذكرها النموذج تُضاف بمقتطفها.
    assert.equal(sources[1]?.domain, "binbaz.org.sa");
    assert.equal(sources[1]?.snippet, true);
  });

  it("«رابط فقط» لا يبقى إلا بلا نص: صفحة بلا كلمات السؤال وبلا اقتباس صحيح", () => {
    const page: FetchedPage = { url: "https://islamqa.info/ar/answers/5", content: LONG_PAGE, kind: "page" };
    const { sources } = verifyWebAnswer(
      { queries: [], explanation: "", sources: [{ url: page.url, title: "t", site: "", quote: "" }] },
      [page],
      undefined,
      keywords("زكاة الإبل والغنم"),
    );
    assert.equal(sources[0].status, "link_only");
  });

  it("مصدر المقتطف يحمل علامة «مقتطف من الصفحة»", () => {
    const [c] = mod.webCandidates([
      { url: "https://binbaz.org.sa/fatwas/9", title: "صلاة المسافر", site: "موقع الشيخ ابن باز", domain: "binbaz.org.sa", status: "verified", quote: "نص", match: "snippet", snippet: true },
    ]);
    assert.match(c.source, /مقتطف من الصفحة/);
    assert.equal(c.linkOnly, undefined);
  });
});

describe("متانة الصيغة (البند 4)", () => {
  it("JSON صالح: النص من الصفحة، بلا طلب إضافي", async () => {
    replyMode = "json";
    sentBodies.length = 0;
    const r = await web.webSearchRead(QUESTION, { phrases: ["صلاة المسافر في الطائرة"] });
    assert.equal(sentBodies.length, 1);
    assert.equal(r.jsonRecovery, undefined);
    assert.equal(r.sources[0].match, "extracted");
  });

  it("لا JSON ← إعادة واحدة بطلب أقصر (بلا أدوات، بمخطط)، ثم النص من الصفحة", async () => {
    replyMode = "nojson";
    sentBodies.length = 0;
    const r = await web.webSearchRead(QUESTION, { phrases: ["صلاة المسافر في الطائرة"] });
    assert.equal(sentBodies.length, 2);
    assert.equal(sentBodies[1].tools, undefined);
    assert.ok(JSON.stringify(sentBodies[1]).length < JSON.stringify(sentBodies[0]).length + 4_000);
    assert.equal(r.jsonRecovery, "retried");
    assert.equal(r.ok, true);
    assert.equal(r.sources[0].status, "verified");
    assert.match(r.sources[0].quote!, /صلى فيها على حسب حاله/);
  });

  it("الإعادة تفشل أيضاً ← المحتوى المقروء ومقتطفات البحث بدل خسارة الطبقة", async () => {
    replyMode = "nojson-retry-fails";
    sentBodies.length = 0;
    const r = await web.webSearchRead(QUESTION, { phrases: ["صلاة المسافر في الطائرة"] });
    assert.equal(r.jsonRecovery, "pages");
    assert.equal(r.ok, true);
    assert.equal(r.error, "no JSON in the model reply");
    assert.deepEqual(r.sources.map((s) => `${s.domain}:${s.status}:${s.match}`), ["islamqa.info:verified:extracted", "binbaz.org.sa:verified:snippet"]);
    assert.equal(r.searchOnly, undefined);
    replyMode = "json";
  });
});

// ---------------------------------------------------------------------------
// السريع أولاً (البند 2)
// ---------------------------------------------------------------------------

const C: Classification = {
  lang: "ar",
  userType: "unknown",
  level: "B",
  urgent: false,
  outOfScope: false,
  aboutMustafti: false,
  needsClarification: false,
  chapter: "salah",
  searchQueries: { ar: ["الصلاة في الطائرة"], userLang: [] },
};

const fatwa = (id: number, text: string): SourceResult => ({
  title: `فتوى ${id}`,
  text,
  url: `https://islamqa.info/ar/answers/${id}`,
  source: "الإسلام سؤال وجواب",
  sourceId: "islamqa",
  lang: "ar",
  fatwa: { mufti: "الإسلام سؤال وجواب", question: `فتوى ${id}`, answer: text, host: "islamqa.info" },
});

const webResult = (quote: string): WebResult => ({
  ok: true,
  queries: [],
  sources: [{ url: "https://binbaz.org.sa/fatwas/9", title: "صلاة المسافر في الطائرة", site: "موقع الشيخ ابن باز", domain: "binbaz.org.sa", status: "verified", quote, match: "extracted" }],
  dropped: [],
  fetched: [],
  explanation: "",
  ms: 1000,
  costUsd: null,
  toolUse: {},
});

function deps(o: Partial<PinDeps>): PinDeps {
  return {
    quranRange: async () => [],
    searchCorpus: async () => [],
    searchAny: async () => [],
    detail: async () => null,
    bayyinatSearch: async () => [],
    bayyinatNumbers: async () => [],
    sourceSearch: async () => [],
    mcpExtra: async () => [],
    ...o,
  };
}

describe("السريع أولاً، و«ابحث واقرأ» لا تُنتظر إن كفى مصدران (البند 2)", () => {
  it("مصدران ذوا صلة من islamqa المحلية ← لا انتظار للطبقة البطيئة", async () => {
    let webAsked = false;
    const t0 = Date.now();
    const r = await mod.retrieve(C, QUESTION, undefined, {
      deps: deps({
        islamqa: async () => [fatwa(1, "الصلاة في الطائرة ذو صلة: يصلي على حسب حاله."), fatwa(2, "صلاة الفريضة في الطائرة ذو صلة: يستقبل القبلة.")],
        web: () => {
          webAsked = true;
          return new Promise((r) => setTimeout(() => r(webResult("نص الطبقة ذو صلة")), 15_000));
        },
      }),
      deadline: Date.now() + 30_000,
    });
    assert.ok(webAsked, "الطبقة بدأت بالتوازي");
    assert.ok(Date.now() - t0 < 4_000, `${Date.now() - t0}ms`);
    assert.equal(r.diag.stages?.earlyExit, true);
    assert.equal(r.diag.stages?.webInRound1, false);
    assert.equal(r.passages.length, 2);
    assert.equal(r.fatwas.length, 2);
    assert.ok(r.fatwas.every((f) => f.mufti === "الإسلام سؤال وجواب"));
    assert.equal(typeof r.diag.stages?.fastMs, "number");
    assert.equal(typeof r.diag.stages?.rerank1Ms, "number");
    assert.ok(r.diag.searches.some((s) => s.source === "islamqa-local" && s.results === 2));
  });

  it("لا يكفي ما وصل ← تُنتظر «ابحث واقرأ» ويُقيَّم نصها في طلب ثانٍ", async () => {
    const r = await mod.retrieve(C, QUESTION, undefined, {
      deps: deps({
        islamqa: async () => [fatwa(3, "مسألة أخرى عن الطهارة.")],
        web: () => new Promise((r) => setTimeout(() => r(webResult("الصلاة في الطائرة ذو صلة: يصلي قائماً إن قدر.")), 1_000)),
      }),
      deadline: Date.now() + 30_000,
    });
    assert.equal(r.diag.stages?.earlyExit, false);
    assert.ok((r.diag.stages?.waitMs ?? 0) >= 500);
    assert.equal(typeof r.diag.stages?.rerank2Ms, "number");
    assert.ok(r.fatwas.some((f) => f.url === "https://binbaz.org.sa/fatwas/9" && /يصلي قائماً/.test(f.excerpt)));
  });

  it("islamqa لأسئلة الفقه فقط (باب أو حكم عام)، وبلغة السائل الإنجليزية", () => {
    assert.equal(mod.wantsIslamqa({ ...C, chapter: undefined, level: "A" }, "من هم أولو العزم من الرسل؟"), false);
    assert.equal(mod.wantsIslamqa({ ...C, chapter: undefined, level: "A" }, "ما حكم بيع التقسيط بزيادة في الثمن؟"), true);
    assert.equal(mod.wantsIslamqa(C, QUESTION), true);
    const en = mod.islamqaQueries({ ...C, lang: "en", searchQueries: { ar: ["الرهن العقاري"], userLang: ["mortgage ruling"] } }, "What is the ruling on mortgages?");
    assert.deepEqual(en, [
      { q: "الرهن العقاري", lang: "ar" },
      { q: "What is the ruling on mortgages?", lang: "en" },
      { q: "mortgage ruling", lang: "en" },
    ]);
  });
});

describe("الحالة D: islamqa المحلية أولاً (البند 1)", () => {
  it("فتويان قريبتان سريعاً ← لا انتظار للطبقة", async () => {
    const t0 = Date.now();
    const r = await mod.caseFatwas({ ...C, level: "D" }, "سافرت وصليت في الطائرة جالساً، هل صلاتي صحيحة؟", {
      deps: deps({
        islamqa: async () => [fatwa(4, "الصلاة في الطائرة جالساً ذو صلة."), fatwa(5, "من صلى جالساً في الطائرة ذو صلة.")],
        web: () => new Promise((r) => setTimeout(() => r(webResult("ذو صلة")), 15_000)),
      }),
      deadline: Date.now() + 26_000,
    });
    assert.ok(Date.now() - t0 < 4_000, `${Date.now() - t0}ms`);
    assert.equal(r.fatwas.length, 2);
    assert.equal(r.diag.rerank, "llm");
  });
});
