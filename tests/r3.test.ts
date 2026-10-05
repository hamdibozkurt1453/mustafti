/**
 * R3: المحادثتان الموجّهتان «المرشد» (/new-muslim) و«الداعية» (/discover).
 *   - اختيار المصادر وترتيبها حسب الوضع (modes.ts، وretrieve بلا شبكة).
 *   - حد الأسئلة التوضيحية: ثلاثة في المسار الموجّه (planForTrack).
 *   - التوجيه حسب الدور مع الاحتياط إلى المفتي (routeTo، resolveRoute).
 *   - الترجمات، وmigration المسار، وأسئلة صفحة الفحص.
 *   npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";

import type { Classification } from "../lib/brain/classify";
import { checkOutput } from "../lib/brain/guard";
import { MESSAGE_LANGS, message } from "../lib/brain/messages";
import {
  basicsLimit,
  CASE_TRACKS,
  CHAT_MODES,
  isChatMode,
  modeUserType,
  modeWantsLibrary,
  rankBonus,
  sourceBoost,
  sourceOrder,
} from "../lib/brain/modes";
import type { PinDeps } from "../lib/brain/retrieval";
import { answerSystem } from "../lib/brain/prompts";
import { personaFor } from "../lib/brain/personas";
import { capPlan, GUIDED_MAX_ASKED, MAX_ASKED, nextQuestion, planForTrack, worstCase } from "../lib/case/flow";
import { fallbackNoteAr, resolveRoute, routeTo } from "../lib/case/routing";
import type { CasePlan, PlanQuestion } from "../lib/case/types";
import { locales } from "../i18n/locales";

process.env.OPENROUTER_API_KEY = "test";
process.env.LLM_MODEL = "test-model";
process.env.MCP_URL = "http://127.0.0.1:9/mcp";
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
type Tree = { [k: string]: string | Tree };
const messages = (l: string) => JSON.parse(read(`messages/${l}.json`)) as Tree;
const at = (t: Tree, path: string): unknown => path.split(".").reduce<unknown>((o, k) => (o as Tree | undefined)?.[k], t);

// ---------------------------------------------------------------------------
// اختيار المصادر حسب الوضع
// ---------------------------------------------------------------------------

describe("R3 · اختيار المصادر حسب mode", () => {
  it("الأوضاع الثلاثة، والمسار بالقيم نفسها", () => {
    assert.deepEqual([...CHAT_MODES], ["general", "new_muslim", "discover"]);
    assert.deepEqual([...CASE_TRACKS], [...CHAT_MODES]);
    assert.ok(isChatMode("discover") && !isChatMode("mufti") && !isChatMode(undefined));
  });

  it("المرشد: مكتبة IslamHouse ثم «بيّنات» ثم «الإسلام سؤال وجواب» المحلي أولاً", () => {
    assert.deepEqual(sourceOrder("new_muslim", false).slice(0, 3), ["library", "bayyinat", "islamqa"]);
    assert.deepEqual(sourceOrder("new_muslim", true).slice(0, 3), ["library", "bayyinat", "islamqa"]);
  });

  it("الداعية: «بيّنات» أولاً ثم المكتبة", () => {
    assert.deepEqual(sourceOrder("discover", false).slice(0, 2), ["bayyinat", "library"]);
  });

  it("العامة كما كانت: «بيّنات» أولاً للشبهات وآخراً لغيرها", () => {
    assert.equal(sourceOrder("general", true)[0], "bayyinat");
    assert.equal(sourceOrder("general", false).at(-1), "bayyinat");
    assert.equal(sourceOrder("general", false)[0], "found");
  });

  it("كل وضع يشمل كل المصادر الخام مرة واحدة (لا يُسقط مصدراً)", () => {
    const all = new Set(sourceOrder("general", false));
    for (const m of CHAT_MODES) {
      for (const s of [true, false]) {
        const order = sourceOrder(m, s);
        assert.equal(order.length, all.size);
        assert.deepEqual(new Set(order), all);
      }
    }
  });

  it("الأولوية: علاوة الترتيب للمصدر المفضّل فقط، وصفر في العامة", () => {
    assert.ok(rankBonus("new_muslim", "islamhouse") > rankBonus("new_muslim", "bayyinat"));
    assert.ok(rankBonus("new_muslim", "bayyinat") > rankBonus("new_muslim", "islamqa"));
    assert.ok(rankBonus("discover", "bayyinat") > rankBonus("discover", "islamhouse"));
    assert.equal(rankBonus("discover", "hadeethenc"), 0);
    for (const s of ["bayyinat", "islamhouse", "islamqa", "hadeethenc"]) {
      assert.equal(rankBonus("general", s), 0);
      assert.equal(sourceBoost("general", s), 0);
    }
    assert.ok(sourceBoost("discover", "bayyinat") > sourceBoost("discover", "islamhouse"));
    // العلاوة لا تكفي وحدها لقبول نص: أقل من الفرق بين 60 و50.
    assert.ok(Math.max(...CHAT_MODES.flatMap((m) => ["bayyinat", "islamhouse", "islamqa"].map((s) => rankBonus(m, s)))) < 10);
  });

  it("«الأساسيات» حتى اثنتين والمكتبة دائماً في الوضعين الموجّهين", () => {
    assert.equal(basicsLimit("general", true), 1);
    assert.equal(basicsLimit("general", false), 2);
    assert.equal(basicsLimit("new_muslim", true), 2);
    assert.equal(basicsLimit("discover", true), 2);
    assert.equal(modeWantsLibrary("general"), false);
    assert.equal(modeWantsLibrary("new_muslim"), true);
    assert.equal(modeWantsLibrary("discover"), true);
  });

  it("نوع السائل من الصفحة، والعامة لا تغيّره", () => {
    assert.equal(modeUserType("new_muslim", "unknown"), "new_muslim");
    assert.equal(modeUserType("new_muslim", "new_muslim"), null);
    assert.equal(modeUserType("discover", "muslim"), "non_muslim");
    assert.equal(modeUserType("general", "unknown"), null);
  });

  it("الشخصية في تعليمات الجواب (R5: lib/brain/personas/)، والقواعد غير القابلة للكسر باقية", () => {
    const base = { question: "س", lang: "ar", mode: "general" as const, passages: [] };
    const nm = answerSystem({ ...base, chatMode: "new_muslim" });
    const di = answerSystem({ ...base, chatMode: "discover" });
    const ge = answerSystem(base);
    assert.match(nm, /مرشد المسلم الجديد/);
    assert.match(di, /داعية مسلم/);
    assert.match(di, /Never criticise, mock or belittle any other religion/);
    assert.match(ge, /مساعد علمي مسلم/);
    assert.doesNotMatch(ge, /مرشد المسلم الجديد|داعية مسلم/);
    for (const s of [nm, di, ge]) assert.match(s, /NON-NEGOTIABLE RULES/);
    // لا اسم نموذج ولا شركة في موجّهات الشخصيات.
    for (const m of CHAT_MODES) assert.doesNotMatch(personaFor(m).system, /gemma|google|openrouter|anthropic|openai|claude|gpt/i);
  });

  it("سطر ما بعد الامتناع: مرشد أو داعية، بلا صيغة حكم في كل اللغات", () => {
    for (const lang of MESSAGE_LANGS) {
      for (const key of ["suggestMentor", "suggestDaee"] as const) {
        const text = message(key, lang);
        assert.ok(text.length > 10, `${key}/${lang}`);
        assert.equal(checkOutput(text, { lang }).findings.length, 0, `${key}/${lang}: ${text}`);
      }
    }
    assert.match(message("suggestDaee", "ar"), /داعية/);
    assert.match(message("suggestMentor", "ar"), /مرشد/);
  });
});

// ---------------------------------------------------------------------------
// retrieve بلا شبكة: المكتبة تُطلب في الوضع الموجّه، والمصدر المفضّل يتقدّم
// ---------------------------------------------------------------------------

const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  if (String(url).includes("openrouter.ai")) {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const name = body.response_format?.json_schema?.name;
    const user = (body.messages as { role: string; content: string }[]).find((m) => m.role === "user")?.content ?? "";
    // كل نص بالدرجة نفسها (75): الترتيب يحسمه الوضع وحده.
    const content =
      name === "relevance" ? JSON.stringify({ scores: [...user.matchAll(/\[(S\d+)\]/g)].map((m) => ({ id: m[1], score: 75 })) }) : "{}";
    return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: {} }), { status: 200 });
  }
  return realFetch(url, init);
}) as typeof fetch;

const C: Classification = {
  lang: "ar",
  userType: "unknown",
  level: "A",
  urgent: false,
  outOfScope: false,
  aboutMustafti: false,
  needsClarification: false,
  searchQueries: { ar: ["الوضوء"], userLang: [] },
};

function deps(libraryCalls: string[]): PinDeps {
  return {
    quranRange: async () => [],
    searchCorpus: async (q, lang, corpus) => {
      if (corpus !== "library") return [];
      libraryCalls.push(q);
      return [{ title: "كيفية الوضوء للمسلم الجديد", text: "الوضوء: غسل الوجه واليدين ومسح الرأس وغسل الرجلين.", url: "https://islamhouse.com/ar/articles/1/" }];
    },
    searchAny: async () => [],
    detail: async () => null,
    bayyinatSearch: async () => [],
    bayyinatNumbers: async () => [],
    sourceSearch: async () => [],
    islamqa: async () => [
      {
        title: "صفة الوضوء",
        text: "الوضوء: غسل الوجه واليدين إلى المرفقين ومسح الرأس وغسل الرجلين.",
        url: "https://islamqa.info/ar/answers/11497",
        source: "الإسلام سؤال وجواب",
        sourceId: "islamqa",
        lang: "ar",
      },
    ],
  };
}

let mod: typeof import("../lib/brain/retrieval");
before(async () => {
  mod = await import("../lib/brain/retrieval");
});

describe("R3 · retrieve حسب mode", () => {
  it("المكتبة لا تُطلب لسؤال عام من المستوى A في الرئيسية، وتُطلب في «المرشد»", async () => {
    const general: string[] = [];
    const r1 = await mod.retrieve(C, "كيف أتوضأ؟", undefined, { deps: deps(general), mode: "general" });
    assert.equal(general.length, 0);
    assert.ok(!r1.diag.searches.some((s) => s.source === "mcp-library"));

    const guided: string[] = [];
    const r2 = await mod.retrieve(C, "كيف أتوضأ؟", undefined, { deps: deps(guided), mode: "new_muslim" });
    assert.ok(guided.length > 0, "بحث المكتبة في وضع المرشد");
    assert.ok(r2.diag.searches.some((s) => s.source === "mcp-library"));
  });

  it("«المرشد»: عند تساوي الدرجة يتقدّم نص IslamHouse على غيره", async () => {
    const { passages } = await mod.retrieve(C, "كيف أتوضأ؟", undefined, { deps: deps([]), mode: "new_muslim" });
    assert.ok(passages.length >= 2, `النصوص: ${passages.map((p) => p.source).join("، ")}`);
    assert.match(passages[0].url, /islamhouse\.com/);
  });

  it("الداعية: المكتبة تُطلب أيضاً، والقبول بالدرجة نفسها (لا يُقبل ما دون 60)", async () => {
    const calls: string[] = [];
    const { passages } = await mod.retrieve(C, "ما الإسلام؟", undefined, { deps: deps(calls), mode: "discover" });
    assert.ok(calls.length > 0);
    assert.ok(passages.every((p) => p.text.length > 0));
  });
});

// ---------------------------------------------------------------------------
// حد الأسئلة التوضيحية
// ---------------------------------------------------------------------------

const Q = (key: string, required: boolean, extra: Partial<PlanQuestion> = {}): PlanQuestion => ({
  key,
  text: key,
  textAr: key,
  why: "",
  whyAr: "",
  type: "text",
  options: [],
  required,
  ...extra,
});

const PLAN: CasePlan = {
  chapter: "new_muslim",
  lang: "ar",
  known: [],
  questions: [
    Q("situation", false),
    Q("family", true, { type: "choice", options: [{ value: "yes", label: "نعم" }, { value: "no", label: "لا" }] }),
    Q("family_detail", true, { showIf: { key: "family", in: ["yes"] } }),
    Q("country", true),
    Q("age", false),
    Q("since", true),
    Q("work", false),
    Q("extra", false),
  ],
};

describe("R3 · حد الأسئلة التوضيحية (ثلاثة في المسار الموجّه)", () => {
  it("الحد 3 للموجّه و8 للعام", () => {
    assert.equal(GUIDED_MAX_ASKED, 3);
    assert.equal(MAX_ASKED, 8);
  });

  for (const track of ["new_muslim", "discover"] as const) {
    it(`${track}: لا يتجاوز أي مسار ثلاثة أسئلة، والإلزامي أولاً`, () => {
      const plan = planForTrack(PLAN, track);
      assert.ok(plan.questions.length <= 3 + 1, "الخطة صغيرة");
      assert.ok(worstCase(plan.questions, plan.questions) <= 3);
      assert.ok(plan.questions.every((q) => q.required), "الإلزامي مقدَّم");
      // سؤال واحد في كل مرة، ثم لا شيء بعد الثالث.
      const answers: { key: string; value: string | null }[] = [];
      let asked = 0;
      for (let next = nextQuestion(plan, answers); next; next = nextQuestion(plan, answers)) {
        asked++;
        assert.ok(next.total <= 3);
        answers.push({ key: next.question.key, value: next.question.key === "family" ? "yes" : "x" });
      }
      assert.ok(asked <= 3 && asked >= 1, `سُئل ${asked}`);
    });
  }

  it("العام كما هو (بلا مسار أو general)", () => {
    assert.equal(planForTrack(PLAN, "general"), PLAN);
    assert.equal(planForTrack(PLAN, undefined), PLAN);
    assert.deepEqual(capPlan(PLAN.questions).length, PLAN.questions.length);
  });

  it("الأركان المعروفة (known) تبقى", () => {
    const withKnown = { ...PLAN, known: [{ key: "country", text: "", textAr: "", value: "تونس" }] };
    assert.deepEqual(planForTrack(withKnown, "new_muslim").known, withKnown.known);
  });
});

// ---------------------------------------------------------------------------
// التوجيه حسب الدور مع الاحتياط
// ---------------------------------------------------------------------------

describe("R3 · التوجيه حسب الدور مع الاحتياط", () => {
  it("المرشد ← mentor، والداعية ← daee، أياً كان الباب ونوع السؤال", () => {
    assert.equal(routeTo("salah", "muslim", "ruling", "new_muslim"), "mentor");
    assert.equal(routeTo("talaq_khul", "unknown", "personal", "new_muslim"), "mentor");
    assert.equal(routeTo("other", "non_muslim", "personal", "discover"), "daee");
    assert.equal(routeTo("other", "non_muslim", "ruling", "discover"), "daee");
  });

  it("العام كما كان", () => {
    assert.equal(routeTo("talaq_khul", "muslim", "personal"), "mufti");
    assert.equal(routeTo("new_muslim", "unknown", "personal", "general"), "mentor");
    assert.equal(routeTo("new_muslim", "new_muslim", "ruling", "general"), "mufti");
  });

  it("لا مرشد معتمد ← المفتي مع ملاحظة، ولا داعية معتمد ← المفتي", () => {
    assert.deepEqual(resolveRoute("mentor", new Set()), { routeTo: "mufti", fallbackFrom: "mentor" });
    assert.deepEqual(resolveRoute("daee", new Set(["mentor"])), { routeTo: "mufti", fallbackFrom: "daee" });
    assert.match(fallbackNoteAr("mentor"), /مرشد/);
    assert.match(fallbackNoteAr("daee"), /داعية/);
  });

  it("المختص المعتمد موجود ← دوره، والمفتي لا احتياط له، وتعذّر القراءة لا يغيّر شيئاً", () => {
    assert.deepEqual(resolveRoute("mentor", new Set(["mentor"])), { routeTo: "mentor" });
    assert.deepEqual(resolveRoute("daee", new Set(["daee"])), { routeTo: "daee" });
    assert.deepEqual(resolveRoute("mufti", new Set()), { routeTo: "mufti" });
    assert.deepEqual(resolveRoute("daee", null), { routeTo: "daee" });
  });

  it("الحفظ: المسار في cases، والاحتياط بملاحظة في ملف المسألة، ومتين قبل الـ migration", () => {
    const store = read("lib/case/store.ts");
    assert.match(store, /track,\n/);
    assert.match(store, /resolveRoute\(wanted, await approvedRoles\(db, wanted\)\)/);
    assert.match(store, /routing: \{ wanted: fallbackFrom, note: fallbackNoteAr\(fallbackFrom\) \}/);
    assert.match(store, /missingColumn\(error, "track"\)/);
  });
});

// ---------------------------------------------------------------------------
// القاعدة والواجهة والترجمة وصفحة الفحص
// ---------------------------------------------------------------------------

describe("R3 · migration المسار", () => {
  const sql = read("supabase/migrations/20261009_case_track.sql");
  it("عمود track بقيمة افتراضية general، والقيم المسموحة الثلاث فقط", () => {
    assert.match(sql, /add column if not exists track text not null default 'general'/);
    assert.match(sql, /check \(track in \('general', 'new_muslim', 'discover'\)\)/);
    assert.match(sql, /grant select \(track\) on public\.cases to authenticated/);
  });
  it("schema.sql يطابقها", () => {
    assert.match(read("supabase/schema.sql"), /track\s+text not null default 'general' check \(track in \('general', 'new_muslim', 'discover'\)\)/);
  });
});

describe("R3 · الصفحتان والتمرير", () => {
  it("الصفحتان تستعملان المحادثة نفسها بوضعها", () => {
    assert.match(read("app/[locale]/new-muslim/page.tsx"), /<GuidedChat mode="new_muslim">/);
    assert.match(read("app/[locale]/discover/page.tsx"), /<GuidedChat mode="discover" \/>/);
    const guided = read("components/chat/GuidedChat.tsx");
    for (const c of ["useChat(mode)", "<ChatView", "<Composer", 'get("q")']) assert.ok(guided.includes(c), c);
  });

  it("الوضع يمرّ إلى الخادم، والرئيسية بلا وضع", () => {
    const chat = read("components/chat/useChat.ts");
    assert.match(chat, /\.\.\.\(mode === "general" \? \{\} : \{ mode \}\)/);
    assert.match(read("app/api/chat/route.ts"), /mode: z\.enum\(CHAT_MODES\)\.optional\(\)/);
    assert.match(read("components/home/HomeExperience.tsx"), /useChat\(\)/);
  });

  it("زرا «أسلمت حديثاً» و«لست مسلماً» يحملان السؤال المكتوب (?q=)", () => {
    const hero = read("components/home/Hero.tsx");
    assert.match(hero, /query: \{ q: text\.trim\(\)/);
    assert.match(hero, /newMuslim: "\/new-muslim", nonMuslim: "\/discover"/);
  });

  for (const l of locales) {
    it(`${l}: عنوان وسطر تعريفي وثلاثة أسئلة لكل صفحة`, () => {
      const m = messages(l);
      for (const ns of ["guided.newMuslim", "guided.discover"]) {
        for (const k of ["kicker", "title", "lead", "q1", "q2", "q3"]) {
          const v = at(m, `${ns}.${k}`);
          assert.ok(typeof v === "string" && v.trim().length > 1, `${l}: ${ns}.${k}`);
        }
        const qs = ["q1", "q2", "q3"].map((k) => at(m, `${ns}.${k}`));
        assert.equal(new Set(qs).size, 3, `${l}: ${ns} أسئلة مختلفة`);
      }
      for (const k of ["chat.askMentor", "chat.askDaee", "case.routeDaee", "experts.dashboard.filterTrack", "experts.dashboard.tracks.discover"]) {
        assert.ok(String(at(m, k) ?? "").trim(), `${l}: ${k}`);
      }
      // لا اسم نموذج ولا شركة في نصوص الصفحتين.
      assert.doesNotMatch(JSON.stringify(at(m, "guided")), /gemma|google|openrouter|anthropic|openai|claude|gpt/i);
    });
  }
});

describe("R3 · صفحة الفحص sources-probe", () => {
  const page = read("app/api/admin/sources-probe/route.ts");
  it("أسئلة المحادثتين في «شغّل الكل»: أربعة لـ new_muslim (R5: «كيف أصلي خطوة بخطوة؟») وثلاثة لـ discover", () => {
    const suite = page.slice(page.indexOf("const SUITE=["), page.indexOf("]];") + 3);
    assert.equal((suite.match(/,"new_muslim"\]/g) ?? []).length, 4);
    assert.equal((suite.match(/,"discover"\]/g) ?? []).length, 3);
    assert.match(page, /post\(m\?\{action:"full",question:q,mode:m\}/);
    assert.match(page, /respond\(question, \{ mode \}\)/);
  });
});
