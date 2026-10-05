/**
 * R1e بلا شبكة: لا امتناع مع نصوص ذات صلة (جواب جزئي، وإشارات [1, 2]، وإعادة بعد امتناع النموذج)،
 * وسبب الامتناع، وجهد التفكير من متغيرات البيئة، والميزانية، وislamqa لكل الأبواب، وإيقاف browse_library.
 * والأمان: لا حكم في كلام الأداة أبداً.
 *   npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";

import { normalizeCitations, stripAbstainSentence, validCitations } from "../lib/brain/format";
import type { Classification } from "../lib/brain/classify";
import type { PinDeps } from "../lib/brain/retrieval";

process.env.OPENROUTER_API_KEY = "test";
process.env.LLM_MODEL = "test-model";
process.env.MCP_URL = "http://127.0.0.1:9/mcp";
process.env.FEATURE_WEB_TOOLS = "false";
delete process.env.LLM_FALLBACK_MODEL;
delete process.env.LLM_REASONING;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

/** لغة كل سؤال، والأجوبة المتتالية للصياغة (آخرها يتكرر). */
const LANG: Record<string, string> = {};
let answers: string[] = [];
const bodies: { name: string; body: Record<string, unknown> }[] = [];

const reply = (content: string) =>
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
      return reply(
        JSON.stringify({
          lang: LANG[user.trim()] ?? "ar",
          userType: "muslim",
          level: "B",
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
    if (name === "citation_plan") return reply(JSON.stringify({ quran: [], surah_info: [], quran_index: false, quran_queries: [], hadith_queries: [], bayyinat_queries: [] }));
    if (name === "relevance") {
      const ids = [...user.matchAll(/\[(S\d+)\]/g)].map((m) => m[1]);
      return reply(JSON.stringify({ scores: ids.map((id) => ({ id, score: 90 })) }));
    }
    if (name === "suggestions") return reply(JSON.stringify({ questions: [] }));
    const n = bodies.filter((b) => b.name === "chat").length;
    return reply(answers[Math.min(n - 1, answers.length - 1)] ?? "");
  }
  const u = new URL(url);
  if (u.hostname === "api.quranpedia.net") {
    const path = decodeURIComponent(u.pathname);
    return new Response(path.endsWith("/fatwas") ? fixture("quranpedia-fatwas.json") : "{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }
  throw new TypeError("fetch failed");
}) as typeof fetch;

let brain: typeof import("../lib/brain/respond");
let messages: typeof import("../lib/brain/messages");
let llm: typeof import("../lib/llm");
let retrieval: typeof import("../lib/brain/retrieval");
before(async () => {
  brain = await import("../lib/brain/respond");
  messages = await import("../lib/brain/messages");
  llm = await import("../lib/llm");
  retrieval = await import("../lib/brain/retrieval");
});

describe("إشارات المصادر وجملة الامتناع (نقي)", () => {
  it("[1, 2] و[1،2] و[1-3] و【1】 و[S1] ← [n] متتالية", () => {
    assert.equal(normalizeCitations("نص [1, 2]."), "نص [1][2].");
    assert.equal(normalizeCitations("نص [1،2] و[2 و 3]"), "نص [1][2] و[2][3]");
    assert.equal(normalizeCitations("نص [1-3]"), "نص [1][2][3]");
    assert.equal(normalizeCitations("نص 【1】 و[S2]"), "نص [1] و[2]");
    assert.equal(normalizeCitations("سورة البقرة [2:255]"), "سورة البقرة [2:255]");
    assert.deepEqual(validCitations("أ [1, 2] ب [9]", 3), [1, 2]);
  });

  it("جملة الامتناع بلا إشارة تُحذف من جواب مُسند، ولا شيء إن لم توجد", () => {
    const phrases = ["لم أجد جواباً كافياً في المصادر المعتمدة"];
    assert.equal(stripAbstainSentence("لم أجد جواباً كافياً في المصادر المعتمدة. لكن من حقوق الزوجة النفقة [1].", phrases), "لكن من حقوق الزوجة النفقة [1].");
    assert.equal(stripAbstainSentence("من حقوق الزوجة النفقة [1].", phrases), null);
  });
});

describe("لا امتناع مع نصوص ذات صلة (البند 2)", () => {
  const ask = async (q: string, lang = "ar") => {
    LANG[q] = lang;
    bodies.length = 0;
    return brain.respond(q);
  };

  it("جواب جزئي فيه جملة الامتناع ← جواب يبدأ بـ «ما وجدناه في المصادر:» بلا جملة الامتناع", async () => {
    answers = ["لم أجد جواباً كافياً في المصادر المعتمدة. لكن من نام عن الصلاة يصليها إذا استيقظ [1]."];
    const r = await ask("ما حقوق الزوجة على زوجها في الإسلام؟");
    assert.equal(r.kind, "answer", r.diag.abstainReason);
    assert.ok(r.text.startsWith(messages.message("partialAnswer", "ar")), r.text);
    assert.ok(!r.text.includes("لم أجد جواباً كافياً"));
    assert.deepEqual(brain.finalCheck(r, "ما حقوق الزوجة على زوجها في الإسلام؟").findings, []);
  });

  it("إشارات [1, 2] تُقبل إسناداً (كانت «no_citation»)", async () => {
    answers = ["يصلي من نام عن الصلاة إذا استيقظ [1, 2]."];
    const r = await ask("ما حكم قضاء الصلاة الفائتة بالنوم؟");
    assert.equal(r.kind, "answer", r.diag.abstainReason);
    assert.match(r.text, /\[1\]\[2\]/);
  });

  it("النموذج امتنع رغم النصوص ← إعادة واحدة تذكّره بأنها ذات صلة، فيجيب", async () => {
    answers = ["لم أجد جواباً كافياً في المصادر المعتمدة.", "يصلي من نام عن الصلاة إذا استيقظ [1]."];
    const r = await ask("كيف يقضي النائم صلاته؟");
    assert.equal(r.kind, "answer");
    const chats = bodies.filter((b) => b.name === "chat");
    assert.equal(chats.length, 2);
    assert.match(JSON.stringify(chats[1].body.messages), /already judged RELEVANT/);
    assert.equal(r.diag.attempts.length, 2);
  });

  it("الإصرار على الامتناع ← امتناع، وسببه model_abstained", async () => {
    answers = ["لم أجد جواباً كافياً في المصادر المعتمدة."];
    const r = await ask("ما فضل صلاة الفجر في جماعة؟");
    assert.equal(r.kind, "abstain");
    assert.equal(r.diag.abstainReason, "model_abstained");
  });

  it("بالتركية: جملة الامتناع التركية مع جواب مُسند ← «Kaynaklarda bulduklarımız:»", async () => {
    answers = ["Onaylı kaynaklarda yeterli bir cevap bulamadım. Uyuyan kişi uyandığında namazını kılar [1]."];
    const r = await ask("Namazın şartları nelerdir?", "tr");
    assert.equal(r.kind, "answer", r.diag.abstainReason);
    assert.ok(r.text.startsWith("Kaynaklarda bulduklarımız:"), r.text);
  });

  it("الأمان: حكم موجَّه إلى السائل («يجوز لك»، «حرام عليك») ← رفض بالرد الثابت ولو بإشارة [n]", async () => {
    answers = ["يجوز لك تأخير الصلاة [1].", "هذا حرام عليك [1]."];
    const r = await ask("هل يجوز تأخير صلاة الفجر عمداً؟");
    assert.notEqual(r.kind, "answer");
    assert.doesNotMatch(r.text, /يجوز لك|حرام عليك/);
    assert.deepEqual(brain.finalCheck(r, "هل يجوز تأخير صلاة الفجر عمداً؟").findings, []);
  });

  it("تعليمات الصياغة: لغة السائل، وإشارة واحدة لكل قوس، والجواب الجزئي بلا جملة الامتناع", async () => {
    answers = ["يصلي من نام عن الصلاة إذا استيقظ [1]."];
    await ask("Namaz nasıl kaza edilir?", "tr");
    const system = String((bodies.find((b) => b.name === "chat")!.body.messages as { content: string }[])[0].content);
    assert.match(system, /asker's language: tr/);
    assert.match(system, /one number per bracket/);
    assert.match(system, /EVIDENCE RULE/);
    assert.match(system, /answer fully from it, without the abstention sentence/);
  });
});

describe("جهد التفكير من متغيرات البيئة (البند 3)", () => {
  it("low للتصنيف والتقييم، وmedium للصياغة، وحيّز لرموز التفكير، وoff يطفئه", async () => {
    assert.equal(llm.reasoningFor("classify"), "low");
    assert.equal(llm.reasoningFor("rerank"), "low");
    assert.equal(llm.reasoningFor("answer"), "low");
    process.env.LLM_REASONING_ANSWER = "high";
    assert.equal(llm.reasoningFor("answer"), "high");
    process.env.LLM_REASONING_ANSWER = "off";
    assert.equal(llm.reasoningFor("answer"), undefined);
    delete process.env.LLM_REASONING_ANSWER;
    process.env.LLM_REASONING = "off";
    assert.equal(llm.reasoningFor("classify"), undefined);
    delete process.env.LLM_REASONING;
    const body = llm.baseBody([{ role: "user", content: "x" }], { maxTokens: 1200, reasoning: "medium" });
    assert.deepEqual(body.reasoning, { effort: "medium", exclude: true });
    assert.equal(body.max_tokens, 1200 + llm.REASONING_ALLOWANCE.medium);
    assert.equal(llm.baseBody([{ role: "user", content: "x" }], { maxTokens: 400 }).reasoning, undefined);
  });

  it("الطلبات الحية: التصنيف low، والتقييم low، والصياغة low (R5: السرعة)", async () => {
    LANG["ما فضل قيام الليل؟"] = "ar";
    answers = ["يصلي من نام عن الصلاة إذا استيقظ [1]."];
    bodies.length = 0;
    await brain.respond("ما فضل قيام الليل؟");
    const effort = (n: string) => (bodies.find((b) => b.name === n)?.body.reasoning as { effort?: string } | undefined)?.effort;
    assert.equal(effort("classification"), "low");
    assert.equal(effort("relevance"), "low");
    assert.equal(effort("chat"), "low");
  });
});

describe("الميزانية بلا قطع صارم (البند 3)", () => {
  it("80 ث للسؤال، و«ابحث واقرأ» 35 ث، وD حتى 50 ث، وmaxDuration 120", () => {
    assert.equal(brain.QUESTION_BUDGET_MS, 80_000);
    assert.equal(brain.WEB_EARLY_MS, 35_000);
    assert.equal(retrieval.WEB_DEADLINE_MS, 35_000);
    assert.equal(retrieval.CASE_FATWA_BUDGET_MS, 50_000);
    for (const f of ["../app/api/chat/route.ts", "../app/api/admin/sources-probe/route.ts"]) {
      assert.match(readFileSync(new URL(f, import.meta.url), "utf8"), /export const maxDuration = 120;/, f);
    }
  });

  it("«ابحث واقرأ» تُنتظر حتى تنتهي (هنا بعد 3 ث) إن لم تكفِ المصادر السريعة", async () => {
    const C: Classification = {
      lang: "ar",
      userType: "unknown",
      level: "A",
      urgent: false,
      outOfScope: false,
      aboutMustafti: false,
      needsClarification: false,
      searchQueries: { ar: ["أولو العزم"], userLang: [] },
    };
    let islamqaAsked = false;
    const deps: PinDeps = {
      quranRange: async () => [],
      searchCorpus: async () => [],
      searchAny: async () => [],
      detail: async () => null,
      bayyinatSearch: async () => [],
      bayyinatNumbers: async () => [],
      sourceSearch: async () => [],
      mcpExtra: async () => [],
      islamqa: async () => {
        islamqaAsked = true;
        return [];
      },
      web: () =>
        new Promise((r) =>
          setTimeout(
            () =>
              r({
                ok: true,
                queries: [],
                sources: [{ url: "https://islamqa.info/ar/answers/1", title: "أولو العزم", site: "الإسلام سؤال وجواب", domain: "islamqa.info", status: "verified", quote: "أولو العزم من الرسل خمسة.", match: "extracted" }],
                dropped: [],
                fetched: [],
                explanation: "",
                ms: 3000,
                costUsd: null,
                toolUse: {},
              }),
            3_000,
          ),
        ),
    };
    const r = await retrieval.retrieve(C, "من هم أولو العزم من الرسل؟", undefined, { deps, deadline: Date.now() + 55_000 });
    assert.ok(islamqaAsked, "islamqa لسؤال عقيدة (البند 4)");
    assert.equal(r.diag.stages?.earlyExit, false);
    assert.ok((r.diag.stages?.waitMs ?? 0) >= 2_000);
    assert.ok(r.fatwas.some((f) => /خمسة/.test(f.excerpt)) || r.passages.some((p) => /خمسة/.test(p.text)));
  });
});

describe("browse_library موقوف نهائياً (البند 5)", () => {
  it("مكتبة IslamHouse عبر search (sources=library) وحده، وbrowse_library في صفحة الفحص فقط", async () => {
    const { CONNECTORS } = await import("../lib/sources/connectors");
    assert.deepEqual(CONNECTORS.islamhouse?.map((m) => m.via), ["MCP: search (sources=library)"]);
    for (const f of ["../lib/sources/connectors.ts", "../lib/brain/retrieval.ts", "../lib/brain/brain-test.ts", "../lib/brain/respond.ts"]) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8");
      assert.doesNotMatch(src, /run\("browse_library"|mcpLibrary\(/, f);
    }
    assert.match(readFileSync(new URL("../lib/sources/probe.ts", import.meta.url), "utf8"), /browse_library/);
  });
});
