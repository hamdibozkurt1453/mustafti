/**
 * اختبارات مسار المستوى D (الاستيضاح وملف المسألة) — بلا نموذج ولا شبكة ولا قاعدة:
 *   npm test
 *
 * - قوالب الأركان: 14 باباً + الأركان العامة، وكل سؤال بحقوله، ولا سؤال عن هوية أو تفاصيل جنسية.
 * - اختيار الأسئلة: 8 كحد أقصى، والإلزامي أولاً، ولا يُسأل عما ذكره السائل.
 * - الأسئلة المولّدة: فحص الحكم والهوية، ومن 3 إلى 6.
 * - حذف الهوية بالأنماط، والتوجيه والأولوية، والموافقة («نعم ساعدني»)، ونوع رسالة الإحالة.
 * - الملف الاحتياطي بلا نموذج، والرمز السري.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkOutput } from "../lib/brain/guard";
import { looksCaseRuling, looksPersonal, referralKindOf } from "../lib/brain/heuristics";
import { MESSAGE_LANGS, MESSAGES, message } from "../lib/brain/messages";
import { CHAPTERS } from "../lib/brain/prompts";
import { isAffirmative } from "../lib/case/affirm";
import { arabicValue, fallbackDraft, rowsOf, unknownsOf } from "../lib/case/draft";
import {
  asksPrivate,
  chapterName,
  isSafeQuestion,
  MAX_QUESTIONS,
  PILLARS,
  safeGenerated,
  selectQuestions,
  templateFor,
  type PillarQuestion,
} from "../lib/case/pillars";
import { REDACTED, redactText } from "../lib/case/redact";
import { priorityOf, routeTo } from "../lib/case/routing";
import { hashCaseToken, isCaseTokenShape, newCaseToken } from "../lib/case/store";
import type { CasePlan } from "../lib/case/types";

const TYPES = new Set(["choice", "number", "text", "yesno"]);
const allTemplateQuestions = (): PillarQuestion[] => [
  ...PILLARS.general,
  ...Object.values(PILLARS.chapters).flatMap((c) => c.questions),
];

// ---------------------------------------------------------------------------
describe("قوالب الأركان (content/pillars.json)", () => {
  it("14 باباً هي أبواب المصنّف نفسها (بلا other)", () => {
    const chapters = Object.keys(PILLARS.chapters).sort();
    assert.equal(chapters.length, 14);
    assert.deepEqual(chapters, CHAPTERS.filter((c) => c !== "other").sort());
  });

  it("الأركان العامة الثمانية", () => {
    assert.deepEqual(
      PILLARS.general.map((q) => q.key),
      ["occurred", "who", "what_exactly", "when", "country", "state_intent", "asked_before", "madhhab"],
    );
    assert.equal(PILLARS.general.find((q) => q.key === "madhhab")?.required, false);
  });

  it("كل سؤال: key فريد، ونص عربي وإنجليزي، ونوع صحيح، وخيارات للاختيار، وإلزامي أو لا", () => {
    const keys = new Set<string>();
    for (const q of allTemplateQuestions()) {
      assert.ok(!keys.has(q.key), `مكرر: ${q.key}`);
      keys.add(q.key);
      assert.ok(q.ar.trim() && q.en.trim(), q.key);
      assert.ok(TYPES.has(q.type), q.key);
      assert.equal(typeof q.required, "boolean", q.key);
      if (q.type === "choice") {
        assert.ok((q.options?.length ?? 0) >= 2, `${q.key}: خيارات`);
        for (const o of q.options!) assert.ok(o.value && o.ar && o.en, `${q.key}: خيار ناقص`);
      }
    }
  });

  it("ترتيب كل باب يشير إلى أسئلة موجودة، وفيه سؤال إلزامي واحد على الأقل", () => {
    for (const [name, t] of Object.entries(PILLARS.chapters)) {
      const own = new Set(t.questions.map((q) => q.key));
      const general = new Set(PILLARS.general.map((q) => q.key));
      for (const key of t.order) assert.ok(own.has(key) || general.has(key), `${name}: ${key}`);
      for (const q of t.questions) assert.ok(t.order.includes(q.key), `${name}: ${q.key} خارج الترتيب`);
      assert.ok(t.questions.some((q) => q.required), name);
      assert.ok(t.ref.length > 10, `${name}: المرجع`);
    }
  });

  it("لا سؤال عن اسم أو رقم هوية أو حساب أو هاتف أو عنوان أو تفاصيل جنسية", () => {
    for (const q of allTemplateQuestions()) {
      for (const text of [q.ar, q.en, ...(q.options ?? []).flatMap((o) => [o.ar, o.en])]) {
        assert.ok(!asksPrivate(text), `${q.key}: ${text}`);
      }
    }
  });

  it("اسم الباب بالعربية والإنجليزية", () => {
    assert.equal(chapterName("talaq_khul", "ar"), "الطلاق والخلع");
    assert.equal(chapterName("talaq_khul", "en"), "Divorce and khul'");
    assert.equal(chapterName("other", "ar"), "باب آخر");
  });
});

// ---------------------------------------------------------------------------
describe("اختيار أسئلة الاستيضاح", () => {
  it("8 أسئلة كحد أقصى في كل باب", () => {
    for (const chapter of CHAPTERS) assert.ok(selectQuestions(chapter).length <= MAX_QUESTIONS, chapter);
    assert.equal(MAX_QUESTIONS, 8);
  });

  it("لا يسأل عما ذكره السائل («طلقت زوجتي وأنا غاضب»)", () => {
    const qs = selectQuestions("talaq_khul", ["occurred", "who", "state_intent", "talaq_type"]).map((q) => q.key);
    for (const k of ["occurred", "who", "state_intent", "talaq_type"]) assert.ok(!qs.includes(k), k);
    assert.ok(qs.includes("talaq_words"));
    assert.ok(qs.includes("talaq_count"));
    assert.ok(qs.length <= 8);
  });

  it("الإلزامي أولاً، مع حفظ ترتيب القالب", () => {
    const qs = selectQuestions("talaq_khul", [], [], 4);
    assert.ok(qs.every((q) => q.required));
    const order = templateFor("talaq_khul").map((q) => q.key);
    const idx = qs.map((q) => order.indexOf(q.key));
    assert.deepEqual(idx, [...idx].sort((a, b) => a - b));
  });

  it("باب آخر: الأركان العامة + المولّدة", () => {
    const gen = safeGenerated([
      { key: "x", ar: "ما الذي أخذته بالضبط؟", en: "What exactly did you take?", type: "text", required: true },
      { key: "x", ar: "هل كان عندك ما تأكله؟", en: "Did you have food?", type: "yesno", required: true },
      { key: "x", ar: "هل أعدت ما أخذت؟", en: "Did you return it?", type: "yesno", required: true },
    ]);
    assert.equal(gen.length, 3);
    assert.deepEqual(gen.map((q) => q.key), ["gen_1", "gen_2", "gen_3"]);
    const qs = selectQuestions("other", ["occurred"], gen).map((q) => q.key);
    assert.ok(qs.includes("gen_1") && qs.includes("who") && !qs.includes("occurred"));
    assert.ok(qs.length <= 8);
  });
});

// ---------------------------------------------------------------------------
describe("الأسئلة المولّدة: فحص الكود", () => {
  it("يرفض الحكم والهوية والتفاصيل الجنسية", () => {
    for (const bad of [
      "ما اسمك الكامل؟",
      "What is your name?",
      "ما رقم الهوية؟",
      "What is your bank account number?",
      "هل حدث جماع؟",
      "Did intercourse happen?",
      "هل تعلم أن هذا حرام؟",
      "Do you think it is permissible?",
    ]) {
      assert.equal(isSafeQuestion(bad), false, bad);
    }
  });

  it("يقبل أسئلة الوقائع", () => {
    for (const ok of ["متى حدث ذلك؟", "How much money was involved?", "هل كنت مسافراً؟", "Kaç kez oldu?"]) {
      assert.equal(isSafeQuestion(ok), true, ok);
    }
  });

  it("أقل من 3 أسئلة آمنة ⇒ لا مولّد، وأكثر من 6 ⇒ 6", () => {
    const q = (ar: string): PillarQuestion => ({ key: "g", ar, en: ar, type: "text", required: true });
    assert.equal(safeGenerated([q("متى حدث ذلك؟"), q("ما اسمك؟"), q("هل هو حرام؟")]).length, 0);
    assert.equal(safeGenerated(Array.from({ length: 9 }, (_, i) => q(`كم مرة حدث ذلك ${i}؟`))).length, 6);
  });
});

// ---------------------------------------------------------------------------
describe("حذف الهوية بالأنماط", () => {
  const cases: [string, string[]][] = [
    ["اسمي أحمد وأسكن في شارع الملك فهد رقم 12", ["أحمد", "فهد", "12"]],
    ["جوالي +966 55 123 4567 وبريدي ahmad@example.com", ["4567", "ahmad@", "example.com"]],
    ["رقم الهوية 1234567890", ["1234567890"]],
    ["طلقها محمد بن عبد الله أمس", ["محمد بن"]],
    ["My name is John Smith, call 0044 7911 123456", ["John", "Smith", "7911"]],
    ["I live at 221 Baker Street", ["Baker"]],
    ["IBAN DE89 3704 0044 0532 0130 00", ["DE89", "3704"]],
    ["Adım Mehmet, Atatürk Caddesi No: 5", ["Mehmet", "Caddesi"]],
    ["Je m'appelle Pierre, 12 rue de la Paix", ["Pierre", "Paix"]],
    ["Nama saya Budi, Jalan Merdeka No. 5", ["Budi", "Merdeka"]],
  ];
  for (const [input, gone] of cases) {
    it(input, () => {
      const out = redactText(input);
      assert.ok(out.includes(REDACTED), out);
      for (const g of gone) assert.ok(!out.includes(g), `${g} ← ${out}`);
    });
  }

  it("يُبقي الوقائع: القرابة، والبلد، والمبالغ والأعداد القصيرة، والتواريخ", () => {
    const text = "طلقت زوجتي بنت عمي ثلاث مرات في ألمانيا سنة 2025، والمبلغ 150000 يورو، وسألت الشيخ في المسجد";
    assert.equal(redactText(text), text);
  });
});

// ---------------------------------------------------------------------------
describe("التوجيه والأولوية", () => {
  it("mufti افتراضياً، وmentor لأسئلة المسلم الجديد الشخصية", () => {
    assert.equal(routeTo("talaq_khul", "muslim", "personal"), "mufti");
    assert.equal(routeTo("new_muslim", "unknown", "personal"), "mentor");
    assert.equal(routeTo("salah", "new_muslim", "personal"), "mentor");
    assert.equal(routeTo("new_muslim", "new_muslim", "ruling"), "mufti");
  });

  it("أولوية عالية: الطلاق، والمواريث، والنزاعات، والدماء، والحكم على الأشخاص", () => {
    assert.equal(priorityOf("talaq_khul", ""), "high");
    assert.equal(priorityOf("inheritance_wills", ""), "high");
    assert.equal(priorityOf("finance", "بيني وبين أخي نزاع على المال"), "high");
    assert.equal(priorityOf("other", "ما حكم من يسرق وهو مضطر لأنه جوعان"), "high");
    assert.equal(priorityOf("other", "Is my neighbour a kafir?"), "high");
    assert.equal(priorityOf("other", "قتل خطأ في حادث"), "high");
  });

  it("أولوية عادية لغيرها، ولا تلتقط «دم» داخل «عدم»", () => {
    assert.equal(priorityOf("salah", "نسيت ركعة من صلاة العصر"), "normal");
    assert.equal(priorityOf("taharah", "عدم وجود الماء واستخدم التيمم"), "normal");
    assert.equal(priorityOf("salah", "Kaza namazı kılmadım, çalışıyorum"), "normal");
  });
});

// ---------------------------------------------------------------------------
describe("الموافقة بعد رسالة الإحالة", () => {
  it("«نعم»، «ساعدني»، «yes»… تبدأ الاستيضاح", () => {
    for (const t of ["نعم ساعدني", "نعم", "ساعدني", "أجل من فضلك", "yes", "Yes please", "ok", "Evet, yardım et", "Oui, aide-moi", "ya, tolong bantu saya", "جی ہاں", "👍"]) {
      assert.equal(isAffirmative(t), true, t);
    }
  });

  it("سؤال جديد أو شكر وحده لا يبدأ الاستيضاح", () => {
    for (const t of ["شكراً", "نعم، لكن ماذا عن الصلاة؟", "ما حكم من يسرق", "thanks", "yes but what about zakat on gold"]) {
      assert.equal(isAffirmative(t), false, t);
    }
  });
});

// ---------------------------------------------------------------------------
describe("رسالة الإحالة بنوعين", () => {
  const ruling = "ما حكم من يسرق وهو مضطر لأنه جوعان";
  const personal = "طلقت زوجتي وأنا غاضب، هل وقع؟";

  it("سؤال الحكم العام ⇒ ruling، ويُرفع إلى D", () => {
    assert.equal(looksCaseRuling(ruling), true);
    assert.equal(referralKindOf(ruling), "ruling");
    assert.equal(referralKindOf("What is the ruling on someone who steals because he is starving?"), "ruling");
  });

  it("الحالة الشخصية ⇒ personal", () => {
    assert.equal(looksPersonal(personal), true);
    assert.equal(referralKindOf(personal), "personal");
    assert.equal(referralKindOf("Babam vefat etti, mirası nasıl paylaşmalıyız?"), "personal");
  });

  it("سؤال معرفي عام («ما حكم صلاة الوتر؟») لا يُرفع إلى D", () => {
    assert.equal(looksCaseRuling("ما حكم صلاة الوتر؟"), false);
    assert.equal(looksCaseRuling("هل الحجاب حكم من الله؟"), false);
  });

  it("نص رسالة الحكم العام حرفياً، وبست لغات، والحارس لا يعترض عليها", () => {
    assert.equal(
      message("referralRuling", "ar"),
      "هذا سؤال عن حكم شرعي، ومُستفتي لا يُصدر أحكاماً. أستطيع أن أساعدك في صياغته وإرساله إلى مفتٍ مؤهل.",
    );
    for (const lang of MESSAGE_LANGS) {
      assert.ok(MESSAGES.referralRuling[lang].trim(), lang);
      assert.deepEqual(checkOutput(MESSAGES.referralRuling[lang], { lang }).findings, [], lang);
    }
  });
});

// ---------------------------------------------------------------------------
describe("ملف المسألة بلا نموذج", () => {
  const plan: CasePlan = {
    chapter: "talaq_khul",
    lang: "ar",
    known: [{ key: "occurred", text: "هل وقع؟", textAr: "هل وقع؟", value: "وقع فعلاً", option: "happened" }],
    questions: [
      { key: "talaq_words", text: "ما الصيغة؟", textAr: "ما الصيغة؟", type: "text", options: [], required: true },
      {
        key: "talaq_count",
        text: "كم طلقة سبقت؟",
        textAr: "كم طلقة سبقت؟",
        type: "choice",
        options: [
          { value: "0", label: "لا شيء، هذه الأولى" },
          { value: "1", label: "طلقة واحدة" },
        ],
        required: true,
      },
      { key: "talaq_after", text: "ماذا حدث بعد؟", textAr: "ماذا حدث بعد؟", type: "text", options: [], required: false },
    ],
  };
  const answers = [
    { key: "talaq_words", value: "قلت لها أنتِ طالق، واسمي خالد وجوالي 0555123456" },
    { key: "talaq_count", value: "0" },
    { key: "talaq_after", value: null },
  ];

  it("قيمة الخيار بالعربية من القالب", () => {
    assert.equal(arabicValue("occurred", "happened"), "وقع فعلاً");
    assert.equal(arabicValue("asked_before", "no"), "لا");
    assert.equal(arabicValue("talaq_words", "x"), null);
  });

  it("جدول الأركان: ما في السؤال ثم الأجوبة، و«ما لم يُعرف» ما تُخطّي", () => {
    const rows = rowsOf(plan, answers);
    assert.deepEqual(rows.map((r) => r.key), ["occurred", "talaq_words", "talaq_count"]);
    assert.equal(rows[0].source, "question");
    assert.equal(rows[2].value, "لا شيء، هذه الأولى");
    assert.deepEqual(unknownsOf(plan, answers).map((u) => u.key), ["talaq_after"]);
  });

  it("الملف الاحتياطي: السؤال والوقائع، بلا هوية", () => {
    const d = fallbackDraft("طلقت زوجتي وأنا غاضب، هل وقع؟", plan, answers);
    assert.ok(d.summaryAr.includes("طلقت زوجتي"));
    assert.ok(!JSON.stringify(d).includes("خالد"));
    assert.ok(!JSON.stringify(d).includes("0555123456"));
    assert.ok(d.rows.find((r) => r.key === "talaq_words")?.value.includes(REDACTED));
    assert.equal(d.summaryUser, d.summaryAr);
  });
});

// ---------------------------------------------------------------------------
describe("الرمز السري", () => {
  it("عشوائي طويل (43 حرفاً base64url)، وبصمته SHA-256", () => {
    const a = newCaseToken();
    const b = newCaseToken();
    assert.notEqual(a, b);
    assert.ok(isCaseTokenShape(a));
    assert.match(hashCaseToken(a), /^[0-9a-f]{64}$/);
    assert.equal(isCaseTokenShape("short"), false);
  });
});
