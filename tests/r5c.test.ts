/**
 * R5c بلا شبكة: الحارس يُعدِّل ولا يبتر. المساعد يجيب بعلمه كاملاً، والمصادر [n] تقوّي الجواب
 * حيث تنطبق. الحارس يتدخل في ثلاث حالات فقط: نص منسوب غير مطابق لمصدر، وفتوى شخصية، واسم نموذج
 * أو محتوى مسيء. ولا يُعرض جواب أقصر من 40% من المولّد.
 *   npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";

import { checkAnswer, isTruncated, MIN_KEEP_RATIO, repairAnswer } from "../lib/brain/guard";
import { checklistBlock, mapChecklist, matchChecklist } from "../lib/brain/howto-checklists";
import { message } from "../lib/brain/messages";
import { CHAT_MODES } from "../lib/brain/modes";
import { personaFor } from "../lib/brain/personas";
import { answerSystem, NON_NEGOTIABLE_RULES } from "../lib/brain/prompts";

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
// نموذج وهمي: التصنيف والتقييم، والصياغة كاملة أو مبثوثة (SSE) بأجوبة متتالية.
// ---------------------------------------------------------------------------

let answers: string[] = [];
let level = "B";
let relevance = 90;
const bodies: { name: string; body: Record<string, unknown> }[] = [];

const json = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }], usage: {} }), { status: 200 });

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
      return json(JSON.stringify({ scores: ids.map((id) => ({ id, score: relevance })) }));
    }
    if (name === "suggestions") return json(JSON.stringify({ questions: [] }));
    const n = bodies.filter((b) => b.name === "chat").length;
    const content = answers[Math.min(n - 1, answers.length - 1)] ?? "";
    return body.stream ? sse(content) : json(content);
  }
  const u = new URL(url);
  if (u.hostname === "api.quranpedia.net") {
    const path = decodeURIComponent(u.pathname);
    return new Response(path.endsWith("/fatwas") ? read("tests/fixtures/quranpedia-fatwas.json") : "{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }
  throw new TypeError("fetch failed");
}) as typeof fetch;

let brain: typeof import("../lib/brain/respond");
before(async () => {
  brain = await import("../lib/brain/respond");
});

const chats = () => bodies.filter((b) => b.name === "chat").length;

// جواب صلاة كامل بأذكاره وأعداد ركعاته، بلا رقم مصدر واحد (كما يكتبه مساعد مسلم من علمه).
const PRAYER = `لا تقلق، الصلاة أسهل مما تظن، وستتعلمها خطوة خطوة.
**قبل الصلاة**
1. ماذا تفعل: توضأ، فالوضوء واجب قبل الصلاة. ويجب عليك أن تستقبل القبلة، وتنوي الصلاة بقلبك.
**الركعة الأولى**
2. ماذا تفعل: ارفع يديك وكبّر. ماذا تقول: «الله أكبر».
3. ماذا تقول (دعاء الاستفتاح): «سبحانك اللهم وبحمدك، وتبارك اسمك، وتعالى جدك، ولا إله غيرك».
4. ماذا تفعل: اقرأ الفاتحة، فهي ركن في كل ركعة، ثم ما تيسر من القرآن.
5. ماذا تفعل: اركع. ماذا تقول: «سبحان ربي العظيم» ثلاث مرات.
6. ماذا تفعل: ارفع من الركوع. ماذا تقول: «سمع الله لمن حمده، ربنا ولك الحمد».
7. ماذا تفعل: اسجد على الأعضاء السبعة. ماذا تقول: «سبحان ربي الأعلى» ثلاث مرات.
8. ماذا تفعل: اجلس بين السجدتين. ماذا تقول: «رب اغفر لي، رب اغفر لي».
**بقية الركعات**
9. ماذا تفعل: الركعة الثانية مثل الأولى بلا دعاء الاستفتاح.
**التشهد والختام**
10. ماذا تقول: «التحيات لله والصلوات والطيبات، السلام عليك أيها النبي ورحمة الله وبركاته، السلام علينا وعلى عباد الله الصالحين، أشهد أن لا إله إلا الله وأشهد أن محمداً عبده ورسوله».
11. ماذا تقول: «اللهم صل على محمد وعلى آل محمد كما صليت على إبراهيم وعلى آل إبراهيم إنك حميد مجيد».
12. ماذا تفعل: سلّم يميناً ثم يساراً. ماذا تقول: «السلام عليكم ورحمة الله».
**عدد الركعات**
الفجر ركعتان، والظهر أربع، والعصر أربع، والمغرب ثلاث، والعشاء أربع. والراجح أن الطمأنينة ركن في كل ذلك.
خطوة خطوة، وستجد الصلاة أسهل مما تظن. بارك الله فيك.`;

const HADITH = "عن النعمان بن بشير رضي الله عنهما قال: سمعت رسول الله ﷺ يقول: «إن الحلال بين، وإن الحرام بين، وبينهما أمور مشتبهات». الدرجة: صحيح، متفق عليه.";
const CTX = { sources: [HADITH], lang: "ar", citeCount: 1 };

// ---------------------------------------------------------------------------
// 1) الجواب الكامل يمر كاملاً
// ---------------------------------------------------------------------------

describe("R5c · الجواب الكامل يمر كما هو (لا حذف لغياب رقم مصدر)", () => {
  it("جواب صلاة كامل بأذكاره وأعداد ركعاته بلا أرقام مصادر ← يمر كاملاً حرفاً بحرف", () => {
    const r = repairAnswer(PRAYER, CTX);
    assert.equal(r.text, PRAYER.trim());
    assert.deepEqual(r.fixes, []);
    assert.deepEqual(r.blocked, []);
    assert.deepEqual(checkAnswer(PRAYER, CTX).findings, []);
  });

  it("الأذكار والأدعية بين «» بلا نسبة لا تُفحص بالمصادر، والأحكام العامة والترجيح بلا رقم تمر", () => {
    for (const t of [
      "قل بعد الصلاة: «أستغفر الله، أستغفر الله، أستغفر الله، اللهم أنت السلام ومنك السلام».",
      "الصلوات المفروضة خمس، وصلاة الجمعة واجبة على الرجال، ويحرم تأخير الصلاة عن وقتها بلا عذر.",
      "والراجح عند أهل العلم أن قراءة الفاتحة ركن في كل ركعة.",
      "معنى الشهادتين: لا معبود بحق إلا الله، وأن محمداً ﷺ عبد الله ورسوله المبلّغ عنه.",
    ]) {
      const r = repairAnswer(t, CTX);
      assert.equal(r.text, t);
      assert.deepEqual(r.fixes, [], t);
    }
  });

  it("respond («المرشد»، بث): الجواب المعروض = المولّد كاملاً، والمبثوث = النهائي، بلا إعادة", async () => {
    level = "B";
    relevance = 90;
    answers = [PRAYER];
    bodies.length = 0;
    let streamed = "";
    const r = await brain.respond("كيف أصلي خطوة بخطوة؟ (R5c)", { mode: "new_muslim", onDelta: (d) => (streamed += d) });
    assert.equal(r.kind, "answer", r.diag.abstainReason);
    assert.equal(r.text, PRAYER.trim());
    assert.equal(streamed.trim(), r.text);
    assert.equal(chats(), 1, "لا إعادة لجواب سليم");
    assert.ok(r.checklist && r.checklist.ratio >= 0.9, JSON.stringify(r.checklist));
    assert.ok(r.text.split("\n").filter((l) => /^\d{1,2}\./.test(l)).length >= 12, "كل الخطوات باقية");
  });

  it("بلا نص مسترجع ذي صلة يُجاب السؤال العام من علم المساعد (لا امتناع)", async () => {
    relevance = 0;
    answers = ["الإحسان أن تعبد الله كأنك تراه، فإن لم تكن تراه فإنه يراك. وهو أعلى مراتب الدين."];
    bodies.length = 0;
    const r = await brain.respond("ما معنى الإحسان؟ (R5c بلا نصوص)");
    relevance = 90;
    assert.equal(r.kind, "answer", r.diag.abstainReason);
    assert.equal(r.passages.length, 0);
    assert.match(r.text, /أعلى مراتب الدين/);
  });
});

// ---------------------------------------------------------------------------
// 2) النص المنسوب غير المطابق
// ---------------------------------------------------------------------------

describe("R5c · النص المنسوب غير المطابق لمصدر: تصحيح، أو تليين بلا علامات ولا نسبة", () => {
  it("حديث بين «» غير مطابق ← تُحذف العلامات والنسبة و«رواه…» ورقمه، ويبقى المعنى بصيغة «ورد في السنة»", () => {
    const t = "الحلال بين [1]. قال رسول الله ﷺ: «من صلى الضحى أربعاً بنى الله له قصراً في الجنة» رواه البخاري (1234). فحافظ على الضحى.";
    const r = repairAnswer(t, CTX);
    assert.equal(r.text, "الحلال بين [1]. ورد في السنة ما معناه: من صلى الضحى أربعاً بنى الله له قصراً في الجنة. فحافظ على الضحى.");
    assert.equal(r.fixes[0].kind, "quote_softened");
    assert.doesNotMatch(r.text, /«|»|قال رسول الله|رواه|1234/);
    assert.ok(!isTruncated(t, r.text));
  });

  it("الحديث المطابق يبقى بعلاماته ونسبته، وشبه المطابق يُصحَّح إلى نص المصدر", () => {
    const ok = "قال رسول الله ﷺ: «إن الحلال بين، وإن الحرام بين» [1].";
    assert.equal(repairAnswer(ok, CTX).text, ok);
    const near = "قال رسول الله ﷺ: «إن الحلال بين، وإن الحرام بين، وبينهما أمور كثيرة مشتبهات» [1].";
    const r = repairAnswer(near, CTX);
    assert.equal(r.fixes[0].kind, "quote_fixed");
    assert.match(r.text, /قال رسول الله ﷺ: «إن الحلال بين، وإن الحرام بين، وبينهما أمور مشتبهات/);
  });

  it("آية ﴿…﴾ غير مطابقة ← «ورد في القرآن الكريم ما معناه:»، وقول عالم ← «ومن كلام أهل العلم ما معناه:»", () => {
    assert.equal(repairAnswer("قال تعالى: ﴿إن الله مع الصابرين في كل حين وزمان﴾.", CTX).text, "ورد في القرآن الكريم ما معناه: إن الله مع الصابرين في كل حين وزمان.");
    assert.equal(
      repairAnswer("قال الإمام النووي: «الصلاة أعظم العبادات البدنية بعد الشهادتين».", CTX).text,
      "ومن كلام أهل العلم ما معناه: الصلاة أعظم العبادات البدنية بعد الشهادتين.",
    );
  });

  it("بالإنجليزية: «The Prophet said» بنص غير مطابق يُليَّن بلغة السائل", () => {
    const r = repairAnswer(`The Prophet ﷺ said: "Smiling at your brother is charity for you today" [1]. Keep smiling.`, { ...CTX, lang: "en" });
    assert.equal(r.text, "It is reported in the Sunnah, in meaning: Smiling at your brother is charity for you today [1]. Keep smiling.");
  });
});

// ---------------------------------------------------------------------------
// 3) الفتوى الشخصية، واسم النموذج، والمسيء
// ---------------------------------------------------------------------------

describe("R5c · الفتوى الشخصية تُمنع، واسم النموذج والمسيء تُحذف جملتهما وحدها", () => {
  it("«طلاقك واقع» ← يُمنع (ولو بإشارة [n])، ومثله «صلاتك باطلة» و«يجوز لك»", () => {
    for (const t of ["طلاقك واقع [1].", "صلاتك باطلة.", "يجوز لك أن تفطر.", "أفتيك بأن عقدك صحيح.", "Your divorce has occurred."]) {
      assert.ok(repairAnswer(t, CTX).blocked.length, t);
    }
    // الحكم العام على الطلاق ليس فتوى شخصية.
    assert.deepEqual(repairAnswer("يقع الطلاق بلفظه الصريح عند جمهور العلماء.", CTX).blocked, []);
  });

  it("respond: «طلاقك واقع» في المحاولتين ← لا يصل إلى السائل، والرد رفض ثابت مع الإحالة", async () => {
    answers = ["طلاقك واقع [1].", "طلاقك واقع ولا شك [1]."];
    bodies.length = 0;
    const r = await brain.respond("ما شروط وقوع الطلاق؟ (R5c)");
    assert.notEqual(r.kind, "answer");
    assert.doesNotMatch(r.text, /طلاقك واقع/);
    assert.ok(r.text.startsWith(message("refusal", "ar")));
    assert.equal(chats(), 2, "إعادة واحدة");
  });

  it("اسم النموذج أو الشركة تُحذف جملته وحدها، والمسيء كذلك", () => {
    const r = repairAnswer("أنا مبني على نموذج Gemma من Google. الصلاة صلة بين العبد وربه، وهي عمود الدين وأول ما يحاسب عليه العبد.", CTX);
    assert.equal(r.text, "الصلاة صلة بين العبد وربه، وهي عمود الدين وأول ما يحاسب عليه العبد.");
    const o = repairAnswer("يا غبي، اقرأ جيداً. الصلاة خمس في اليوم والليلة، أولها الفجر وآخرها العشاء.", CTX);
    assert.equal(o.text, "الصلاة خمس في اليوم والليلة، أولها الفجر وآخرها العشاء.");
    assert.equal(o.fixes[0].reason, "offensive");
    // «لحم الخنزير» و«الكلب» حكم عام لا شتم.
    const t = "يحرم أكل لحم الخنزير، وسؤر الكلب نجس عند جمهور العلماء.";
    assert.equal(repairAnswer(t, CTX).text, t);
  });
});

// ---------------------------------------------------------------------------
// 4) لا جواب مبتور (أقصر من 40% من المولّد)
// ---------------------------------------------------------------------------

describe("R5c · لا يُعرض جواب أقصر من 40% من الجواب المولّد", () => {
  it("isTruncated: الحد 40%", () => {
    assert.equal(MIN_KEEP_RATIO, 0.4);
    assert.equal(isTruncated("a".repeat(100), "a".repeat(40)), false);
    assert.equal(isTruncated("a".repeat(100), "a".repeat(39)), true);
    assert.equal(isTruncated("", ""), false);
  });

  const LEAK =
    "أنا نموذج لغوي اسمه Gemma طورته شركة Google، ودُرّبت على كمية هائلة من النصوص والكتب والمقالات من مصادر كثيرة جداً حول العالم، ولذلك أستطيع الإجابة عن أسئلة كثيرة. الإحسان مرتبة عالية.";
  const GOOD = "الإحسان أن تعبد الله كأنك تراه، فإن لم تكن تراه فإنه يراك. وهو أعلى مراتب الدين، فوق الإسلام والإيمان.";

  it("جواب صار بعد التعديل أقصر من 40% ← إعادة، والثانية الكاملة تُعرض", async () => {
    assert.ok(isTruncated(LEAK, repairAnswer(LEAK, CTX).text));
    answers = [LEAK, GOOD];
    bodies.length = 0;
    const r = await brain.respond("ما معنى الإحسان؟ (R5c ٤٠٪)");
    assert.equal(r.kind, "answer", r.diag.abstainReason);
    assert.equal(r.text, GOOD);
    assert.equal(chats(), 2);
    assert.match(JSON.stringify(bodies.at(-1)!.body.messages), /never mention any AI model or company/);
  });

  it("وإن بقي مبتوراً بعد الإعادة: لا يُعرض المقطع، بل الرد الثابت (بلا اسم نموذج)", async () => {
    answers = [LEAK, LEAK];
    bodies.length = 0;
    const r = await brain.respond("ما معنى الإحسان؟ (R5c ٤٠٪ ثانية)");
    assert.notEqual(r.kind, "answer");
    assert.doesNotMatch(r.text, /الإحسان مرتبة عالية|Gemma|Google/);
    assert.ok(r.text.startsWith(message("identityWho", "ar")));
  });

  it("تعديل صغير (تليين حديث) لا يُعدّ بتراً: الجواب يُعرض", async () => {
    const t = `${GOOD} وقال رسول الله ﷺ: «من تبسم في وجه أخيه كتبت له صدقة عظيمة». فابتسم.`;
    answers = [t];
    bodies.length = 0;
    const r = await brain.respond("ما معنى الإحسان؟ (R5c تليين)");
    assert.equal(r.kind, "answer");
    assert.match(r.text, /ورد في السنة ما معناه: من تبسم في وجه أخيه/);
    assert.ok(r.text.length >= MIN_KEEP_RATIO * t.length);
  });
});

// ---------------------------------------------------------------------------
// 5) الموجّهات والقائمة
// ---------------------------------------------------------------------------

describe("R5c · الموجّهات: أجب كاملاً من علمك، والقائمة تذكير لا بوابة", () => {
  it("كل شخصية تحمل الجملة صراحة، والقواعد لا تقصر الجواب على النصوص", () => {
    const line = "أجب كاملاً من علمك، واستشهد بالمصادر [n] حيث تنطبق. لا تقل إنك لا تستطيع الإجابة إلا في الفتوى الشخصية.";
    for (const mode of CHAT_MODES) {
      assert.ok(personaFor(mode).system.includes(line), mode);
      const sys = answerSystem({ question: "س", lang: "ar", mode: "general", passages: [], chatMode: mode });
      assert.ok(sys.includes(line), mode);
      assert.doesNotMatch(sys, /ONLY from the RETRIEVED PASSAGES|not from your memory|Never add a step or words that no passage states|NO PASSAGE/);
    }
    assert.match(NON_NEGOTIABLE_RULES, /ANSWER FULLY FROM YOUR KNOWLEDGE/);
    assert.match(NON_NEGOTIABLE_RULES, /NO PERSONAL FATWA/);
    assert.doesNotMatch(NON_NEGOTIABLE_RULES, /gemma|google|openrouter/i);
  });

  it("قائمة الصلاة تذكير: كل العناصر تُطلب ولو بلا نص، ولا أمر بالحذف", () => {
    const list = matchChecklist("كيف أصلي خطوة بخطوة؟")!;
    const block = checklistBlock(list, mapChecklist(list, []), "ar");
    for (const item of list.items) assert.ok(block.includes(item.ar), item.id);
    assert.doesNotMatch(block, /do not write|never invent|NO PASSAGE/);
    assert.match(block, /from your knowledge/);
  });

  it("«شغّل الكل»: عمودا الاكتمال والزمن باقيان", () => {
    const page = read("app/api/admin/sources-probe/route.ts");
    assert.ok(page.includes("<th>اكتمال</th>") && page.includes("<th>الزمن</th>") && page.includes("<th>زمن كل مصدر سريع</th>"));
  });

  it("ذاكرة الأجوبة بنسخة r5c (لا يُعاد جواب مبتور كُتب بالحارس السابق)", async () => {
    const cache = await import("../lib/brain/answer-cache");
    assert.equal(cache.ANSWER_CACHE_VERSION, "r5c");
  });
});
