/**
 * اختبار الاسترجاع بلا شبكة: مصادر MCP وSupabase مستبدلة (PinDeps)، ونقطة النموذج مستبدلة
 * بـ fetch وهمي يلتقط ما يُرسل لتقييم الصلة.
 *   npm test   (يعمل بـ --conditions=react-server لأن lib/brain/retrieval.ts للخادم فقط)
 */
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import type { Classification } from "../lib/brain/classify";
import type { CitationPlan } from "../lib/brain/plan";
import type { Candidate, PinDeps, RetrievalDiag } from "../lib/brain/retrieval";

process.env.OPENROUTER_API_KEY = "test";
process.env.LLM_MODEL = "test-model";
process.env.MCP_URL = "http://127.0.0.1:9/mcp"; // لا خادم: البحث بالكلمات يفشل فوراً
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

/** ما يُرسل إلى تقييم الصلة (رسالة المستخدم في طلب relevance). */
const scoringInputs: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  if (String(url).includes("openrouter.ai")) {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const name = body.response_format?.json_schema?.name;
    const user = (body.messages as { role: string; content: string }[]).find((m) => m.role === "user")?.content ?? "";
    let content = "{}";
    if (name === "relevance") {
      scoringInputs.push(user);
      const ids = [...user.matchAll(/\[(S\d+)\]/g)].map((m) => m[1]);
      content = JSON.stringify({ scores: ids.map((id) => ({ id, score: 3 })) });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: {} }), { status: 200 });
  }
  return realFetch(url, init);
}) as typeof fetch;

/** رد get_quran_verses كما يرسله الخادم: رأس وتعليمات وذيل CITE حول النص. */
const VERSE_2_127 = [
  "──────── RETRIEVED FROM QURANENC — published text ────────",
  "البقرة 2:127",
  "[EXACT] the verse itself — reproduce these words exactly",
  "وَإِذۡ يَرۡفَعُ إِبۡرَٰهِـۧمُ ٱلۡقَوَاعِدَ مِنَ ٱلۡبَيۡتِ وَإِسۡمَٰعِيلُ",
  "[/EXACT]",
  "التفسير الميسر: واذكر -أيها النبي- حين رفع إبراهيم وإسماعيل عليهما السلام أسس الكعبة",
  "──────── CITE ────────",
  "Every result you carry into your reply must bring the URL",
].join("\n");

const SURAH_3 = ["──────── RETRIEVED FROM QURANENC ────────", "سورة آل عمران — 200 آية", "3:1 الٓمٓ", "──────── CITE ────────"].join("\n");

function deps(overrides: Partial<PinDeps> = {}): PinDeps {
  return {
    quranRange: async (surah, ayah) =>
      surah === 2 && ayah === 127
        ? [{ title: "البقرة 2:127", text: VERSE_2_127, url: "https://quranenc.com/ar/browse/arabic_moyassar/2#127" }]
        : surah === 3 && ayah === 1
          ? [{ title: "آل عمران 3:1", text: SURAH_3, url: "https://quranenc.com/ar/browse/arabic_moyassar/3#1" }]
          : [],
    searchCorpus: async () => [],
    searchAny: async () => [],
    detail: async () => null,
    bayyinatSearch: async () => [],
    bayyinatNumbers: async () => [],
    ...overrides,
  };
}

const C: Classification = {
  lang: "ar",
  userType: "unknown",
  level: "A",
  urgent: false,
  outOfScope: false,
  aboutMustafti: false,
  needsClarification: false,
  searchQueries: { ar: ["بناء الكعبة"], userLang: [] },
};

const PLAN = (p: Partial<CitationPlan>): Promise<CitationPlan> =>
  Promise.resolve({ quran: [], surahInfo: [], hadithQueries: [], bayyinatQueries: [], libraryQueries: [], ...p });

const emptyDiag = (): RetrievalDiag => ({
  queries: [],
  searches: [],
  retried: false,
  counts: { raw: 0, cleaned: 0, ranked: 0, kept: 0 },
  dropped: [],
  scored: [],
  rerank: "llm",
});

let mod: typeof import("../lib/brain/retrieval");
before(async () => {
  mod = await import("../lib/brain/retrieval");
});

describe("خطة الإحالات تصل إلى تقييم الصلة", () => {
  it("plan {quran:[2:127]} ← مرشح بنص الآية واسم السورة والتفسير، بلا رأس الخادم وتعليماته", async () => {
    const diag = emptyDiag();
    const pinned = await mod.pinnedCandidates(C, "من قام ببناء الكعبة", diag, PLAN({ quran: [{ surah: 2, ayah: 127 }] }), deps());
    assert.equal(pinned.length, 1);
    const v = pinned[0] as Candidate;
    assert.match(v.text, /يَرۡفَعُ إِبۡرَٰهِـۧمُ ٱلۡقَوَاعِدَ/);
    assert.match(v.text, /التفسير الميسر/);
    assert.doesNotMatch(v.text, /RETRIEVED|EXACT|reproduce|CITE|Every result/);
    assert.match(v.source, /البقرة/);
    assert.equal(v.pinned, true);
    assert.deepEqual(diag.pinLog?.map((x) => x.status), ["ok"]);
  });

  it("retrieve: المرشح نفسه في مدخلات التقييم، ويُحسب «بلغ التقييم» ويُقبل", async () => {
    scoringInputs.length = 0;
    const { passages, diag } = await mod.retrieve(C, "من قام ببناء الكعبة", PLAN({ quran: [{ surah: 2, ayah: 127 }] }), deps());
    assert.ok(scoringInputs.some((x) => /يَرۡفَعُ إِبۡرَٰهِـۧمُ/.test(x) && /التفسير الميسر/.test(x)), "نص الآية والتفسير في مدخلات التقييم");
    assert.equal(diag.pinned, 1);
    assert.ok(passages.some((p) => /يَرۡفَعُ إِبۡرَٰهِـۧمُ/.test(p.text)));
  });

  it("surah_info ← «سورة آل عمران — رقم 3 في ترتيب المصحف — عدد آياتها 200» من الرد وحده", async () => {
    const pinned = await mod.pinnedCandidates(C, "ما السورة الثالثة", emptyDiag(), PLAN({ surahInfo: [3] }), deps());
    assert.equal(pinned.length, 1);
    assert.match(pinned[0].text, /^سورة آل عمران — رقم 3 في ترتيب المصحف — عدد آياتها 200/);
  });

  it("آية غير موجودة تسقط وتُسجَّل «فارغ»", async () => {
    const diag = emptyDiag();
    const pinned = await mod.pinnedCandidates(C, "سؤال", diag, PLAN({ quran: [{ surah: 2, ayah: 999 }] }), deps());
    assert.equal(pinned.length, 0);
    assert.deepEqual(diag.pinLog?.map((x) => x.status), ["empty"]);
  });

  it("الحديث: إن عاد البحث المقيَّد فارغاً فالبحث بلا تقييد، أعلى نتيجتين، بالدرجة والشرح", async () => {
    const calls: string[] = [];
    const pinned = await mod.pinnedCandidates(
      C,
      "ما أركان الإسلام",
      emptyDiag(),
      PLAN({ hadithQueries: ["بني الإسلام خمس"] }),
      deps({
        searchCorpus: async (q, lang, corpus) => {
          calls.push(`corpus:${corpus}:${q}`);
          return [];
        },
        searchAny: async (q) => {
          calls.push(`any:${q}`);
          return [
            { title: "بني الإسلام على خمس", text: "بني الإسلام على خمس", url: "https://hadeethenc.com/ar/browse/hadith/3", ref: "hadith:3:ar", corpus: "hadith" },
            { title: "آية", text: "x", url: "https://quranenc.com/x", corpus: "quran" },
            { title: "حديث آخر", text: "y", url: "https://hadeethenc.com/ar/browse/hadith/4", ref: "hadith:4:ar", corpus: "hadith" },
          ];
        },
        detail: async (ref) => (ref === "hadith:3:ar" ? { text: "عن ابن عمر… الشرح: …", grade: "صحيح" } : null),
      }),
    );
    assert.deepEqual(calls, ["corpus:hadith:بني الإسلام خمس", "any:بني الإسلام خمس"]);
    assert.equal(pinned.length, 2);
    assert.equal(pinned[0].grade, "صحيح");
    assert.ok(pinned.every((p) => p.sourceId === "hadeethenc"));
  });

  it("بيّنات من الخطة بعبارات عبر البحث، لا بأرقام", async () => {
    const asked: string[] = [];
    const pinned = await mod.pinnedCandidates(
      C,
      "لماذا يعبد المسلمون الكعبة",
      emptyDiag(),
      PLAN({ bayyinatQueries: ["عبادة الكعبة"] }),
      deps({
        bayyinatSearch: async (q) => {
          asked.push(q);
          return [{ title: "بيّنات — السؤال رقم 9", text: "نص", url: "https://dawa.center/file/7937#9", source: "بيّنات", sourceId: "bayyinat" }];
        },
        bayyinatNumbers: async () => {
          throw new Error("لا أرقام من الخطة");
        },
      }),
    );
    assert.deepEqual(asked, ["عبادة الكعبة"]);
    assert.equal(pinned.length, 1);
  });
});
