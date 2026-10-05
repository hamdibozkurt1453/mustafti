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
      content = JSON.stringify({ scores: ids.map((id) => ({ id, score: 90 })) });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: {} }), { status: 200 });
  }
  return realFetch(url, init);
}) as typeof fetch;

/** رد get_quran_verses كما يرسله الخادم: رأس وتعليمات وذيل CITE حول النص. */
const VERSE_2_127 = [
  "──────── RETRIEVED FROM QURANENC — published text ────────",
  '[Surah 2, translation "arabic_moyassar"]',
  "[EXACT] the verse itself — reproduce these words exactly",
  "[2:127]",
  "وَإِذۡ يَرۡفَعُ إِبۡرَٰهِـۧمُ ٱلۡقَوَاعِدَ مِنَ ٱلۡبَيۡتِ وَإِسۡمَٰعِيلُ",
  "واذكر -أيها النبي- حين رفع إبراهيم وإسماعيل عليهما السلام أسس الكعبة",
  "[/EXACT]",
  "Source: https://islamenc.com/ar/quran/2/127",
  "──────── CITE ────────",
  "Every result you carry into your reply must bring the URL",
].join("\n");

/** رد الخادم الفعلي لآل عمران 1: التفسير يذكر «سورة البقرة»، والرد لا يذكر اسم السورة. */
const VERSE_3_1 = [
  "──────── RETRIEVED FROM QURANENC ────────",
  '[Surah 3, translation "arabic_moyassar"]',
  "[EXACT] the verse itself — reproduce these words exactly",
  "[3:1]",
  "الٓمٓ",
  "سبق الكلام عليها في أول سورة البقرة.",
  "[/EXACT]",
  "Source: https://islamenc.com/ar/quran/3/1",
  "──────── CITE ────────",
].join("\n");

function deps(overrides: Partial<PinDeps> = {}): PinDeps {
  return {
    quranRange: async (surah, ayah) =>
      surah === 2 && ayah === 127
        ? [{ title: "البقرة 2:127", text: VERSE_2_127, url: "https://quranenc.com/ar/browse/arabic_moyassar/2#127" }]
        : surah === 3 && ayah === 1
          ? [{ title: '[Surah 3, translation "arabic_moyassar"]', text: VERSE_3_1, url: "https://quranenc.com/ar/browse/arabic_moyassar/3#1" }]
          : [],
    searchCorpus: async () => [],
    searchAny: async () => [],
    detail: async () => null,
    bayyinatSearch: async () => [],
    bayyinatNumbers: async () => [],
    // مصادر HTTP (Quranpedia والدرر) بلا شبكة في الاختبار.
    sourceSearch: async () => [],
    tafsir: async () => [],
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
  Promise.resolve({ quran: [], surahInfo: [], quranIndex: false, quranQueries: [], hadithQueries: [], bayyinatQueries: [], ...p });

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
    assert.match(v.text, /التفسير الميسر: واذكر/);
    assert.doesNotMatch(v.text, /RETRIEVED|EXACT|reproduce|CITE|Every result|\[Surah|\[2:127\]|Source:/);
    assert.equal(v.title, "سورة البقرة — الآية 127");
    assert.match(v.source, /البقرة/);
    assert.equal(v.url, "https://islamenc.com/ar/quran/2/127");
    assert.match(v.verse ?? "", /^وَإِذۡ يَرۡفَعُ/);
    assert.equal(v.noteKind, "tafsir");
    assert.equal(v.pinned, true);
    // ومعها مراجع «الأساسيات» المطابقة للسؤال (القبلة) تُسجَّل كغيرها.
    assert.equal(diag.pinLog?.find((x) => x.ref === "آية 2:127")?.status, "ok");
  });

  it("retrieve: المرشح نفسه في مدخلات التقييم، ويُحسب «بلغ التقييم» ويُقبل", async () => {
    scoringInputs.length = 0;
    const { passages, diag } = await mod.retrieve(C, "من قام ببناء الكعبة", PLAN({ quran: [{ surah: 2, ayah: 127 }] }), { deps: deps() });
    assert.ok(scoringInputs.some((x) => /يَرۡفَعُ إِبۡرَٰهِـۧمُ/.test(x) && /التفسير الميسر/.test(x)), "نص الآية والتفسير في مدخلات التقييم");
    assert.equal(diag.pinned, 1);
    assert.ok(passages.some((p) => /يَرۡفَعُ إِبۡرَٰهِـۧمُ/.test(p.text)));
  });

  it("surah_info ← «سورة آل عمران — رقم 3 … 200» من فهرس المصحف، ولو تعطل MCP", async () => {
    const pinned = await mod.pinnedCandidates(
      C,
      "ما السورة الثالثة",
      emptyDiag(),
      PLAN({ surahInfo: [3] }),
      deps({ quranRange: async () => { throw new Error("429"); } }),
    );
    assert.equal(pinned.length, 1);
    assert.equal(pinned[0].text, "سورة آل عمران — رقم 3 في ترتيب المصحف — عدد آياتها 200 — مدنية");
    assert.equal(pinned[0].source, "فهرس سور المصحف");
    assert.equal(pinned[0].url, "https://islamenc.com/ar/quran/3");
  });

  it("آية آل عمران 1: الاسم من الفهرس لا من التفسير («سورة البقرة» في نصه)", async () => {
    const pinned = await mod.pinnedCandidates(C, "ما أول آية في آل عمران", emptyDiag(), PLAN({ quran: [{ surah: 3, ayah: 1 }] }), deps());
    assert.equal(pinned.length, 1);
    assert.equal(pinned[0].title, "سورة آل عمران — الآية 1");
    assert.match(pinned[0].source, /آل عمران/);
    assert.doesNotMatch(pinned[0].source, /البقرة/);
    assert.equal(pinned[0].verse, "الٓمٓ");
    assert.equal(pinned[0].note, "سبق الكلام عليها في أول سورة البقرة.");
  });

  it("quran_index ← «عدد سور القرآن الكريم في المصحف 114 سورة»", async () => {
    const pinned = await mod.pinnedCandidates(C, "كم عدد سور القرآن", emptyDiag(), PLAN({ quranIndex: true }), deps());
    assert.equal(pinned.length, 1);
    assert.match(pinned[0].text, /114 سورة/);
    assert.match(pinned[0].text, /6236 آية/);
  });

  it("quran_queries ← البحث في نص القرآن ثم get_quran_verses للموضع", async () => {
    const asked: string[] = [];
    const pinned = await mod.pinnedCandidates(
      C,
      "من قام ببناء الكعبة",
      emptyDiag(),
      PLAN({ quranQueries: ["يرفع إبراهيم القواعد"] }),
      deps({
        searchCorpus: async (q, lang, corpus) => {
          asked.push(`${corpus}:${lang}:${q}`);
          return corpus === "quran" ? [{ title: "البقرة 2:127", text: "…", url: "https://quranenc.com/ar/browse/arabic_moyassar/2#127" }] : [];
        },
      }),
    );
    assert.deepEqual(asked, ["quran:ar:يرفع إبراهيم القواعد"]);
    assert.equal(pinned.length, 1);
    assert.equal(pinned[0].title, "سورة البقرة — الآية 127");
  });

  it("آية خارج عدد آيات سورتها تسقط بلا طلب للخادم وتُسجَّل «فارغ»", async () => {
    const diag = emptyDiag();
    const pinned = await mod.pinnedCandidates(
      C,
      "سؤال",
      diag,
      PLAN({ quran: [{ surah: 2, ayah: 287 }] }),
      deps({ quranRange: async () => { throw new Error("لا طلب لآية غير موجودة"); } }),
    );
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
    // عبارة الخطة، ثم عبارة «الأساسيات» لأركان الإسلام (بلا نتائج هنا).
    const own = calls.filter((x) => x.endsWith(":بني الإسلام خمس"));
    assert.deepEqual(own, ["corpus:hadith:بني الإسلام خمس", "any:بني الإسلام خمس"]);
    assert.ok(calls.includes("corpus:hadith:بني الإسلام على خمس"));
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

  it("إعادة التخطيط مرة واحدة إن لم يبلغ أي موضع 60، مع ذكر المواضع الفاشلة", async () => {
    scoringInputs.length = 0;
    const failedSeen: string[][] = [];
    const prev = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes("openrouter.ai")) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        const user = (body.messages as { role: string; content: string }[]).find((m) => m.role === "user")?.content ?? "";
        // كل نص يُقيَّم وحده بمعرّفه: آية البقرة 127 ذات صلة، وآية العلق 12 لا.
        const blocks = user.split(/\n\n(?=\[S\d+\])/);
        const scores = blocks.flatMap((b) => {
          const id = b.match(/\[(S\d+)\]/)?.[1];
          return id ? [{ id, score: /يَرۡفَعُ/.test(b) ? 90 : 10 }] : [];
        });
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ scores }) } }], usage: {} }), { status: 200 });
      }
      return prev(url, init);
    }) as typeof fetch;
    try {
      const { passages, diag } = await mod.retrieve(
        C,
        "من قام ببناء الكعبة",
        PLAN({ quran: [{ surah: 96, ayah: 12 }] }),
        {
          deps: deps({
          quranRange: async (surah, ayah) =>
            surah === 96
              ? [{ title: "x", text: "[96:12]\nأَوۡ أَمَرَ بِٱلتَّقۡوَىٰٓ\nأو أمر غيره بالتقوى", url: "https://quranenc.com/ar/browse/arabic_moyassar/96#12" }]
              : surah === 2 && ayah === 127
                ? [{ title: "x", text: VERSE_2_127, url: "u" }]
                : [],
          }),
          replan: async (failed) => {
            failedSeen.push(failed);
            return { quran: [{ surah: 2, ayah: 127 }], surahInfo: [], quranIndex: false, quranQueries: [], hadithQueries: [], bayyinatQueries: [] };
          },
        },
      );
      assert.deepEqual(failedSeen, [["quran 96:12"]]);
      assert.deepEqual(diag.replan?.quran, [{ surah: 2, ayah: 127 }]);
      assert.ok(passages.some((p) => p.title === "سورة البقرة — الآية 127"));
      assert.ok(diag.pinLog?.some((x) => x.ref.startsWith("↻")));
    } finally {
      globalThis.fetch = prev;
    }
  });

  it("«ماهو تفسير الآية الثانية من السورة رقم 10» ← يونس 2 بالتفسير الميسر، ولو كانت الخطة فارغة", async () => {
    const asked: string[] = [];
    const pinned = await mod.pinnedCandidates(
      C,
      "ماهو تفسير الآية الثانية من السورة رقم 10",
      emptyDiag(),
      PLAN({}),
      deps({
        quranRange: async (surah, ayah) => {
          asked.push(`${surah}:${ayah}`);
          return surah === 10 && ayah === 2
            ? [{ title: "x", text: "[10:2]\nأَكَانَ لِلنَّاسِ عَجَبًا\nأكان أمرًا عجبًا للناس", url: "u" }]
            : [];
        },
      }),
    );
    assert.deepEqual(asked, ["10:2"]);
    assert.equal(pinned.length, 1);
    assert.equal(pinned[0].title, "سورة يونس — الآية 2");
    assert.match(pinned[0].text, /التفسير الميسر: أكان أمرًا عجبًا للناس/);
  });

  it("بحث القرآن بالكلمات لا يؤخِّر الجواب إن بلغ مرجع محدد 60", async () => {
    const t0 = Date.now();
    const { passages } = await mod.retrieve(C, "من قام ببناء الكعبة", PLAN({ quran: [{ surah: 2, ayah: 127 }], quranQueries: ["يرفع إبراهيم القواعد"] }), {
      deps: deps({ searchCorpus: () => new Promise((r) => setTimeout(() => r([]), 3_000)) }),
      deadline: Date.now() + 20_000,
    });
    assert.ok(Date.now() - t0 < 2_000, `${Date.now() - t0}ms`);
    assert.ok(passages.some((p) => p.title === "سورة البقرة — الآية 127"));
  });
});
