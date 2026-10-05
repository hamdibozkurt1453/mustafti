import "server-only";

import { cacheGet, cacheSet, DAY } from "@/lib/cache";
import { chat, reasoningFor, type ChatMessage } from "@/lib/llm";
import { classify, type Classification } from "./classify";
import { checkOutput, guardAndLog, matchKey, type GuardResult } from "./guard";
import { looksCaseRuling, looksGeneralRuling, looksPersonal, looksPersonalFacts, looksUrgent, referralKindOf } from "./heuristics";
import { detectIdentityProbe, guessLang, identityReply, type IdentityProbe } from "./identity";
import { answerFormatIssues, normalizeCitations, stripAbstainSentence, unquoteReferenceOnly, validCitations } from "./format";
import type { ReferralKind } from "@/lib/case/types";
import { message } from "./messages";
import { planCitations, type CitationPlan } from "./planner";
import {
  arabicPhrases,
  caseFatwas,
  CASE_FATWA_BUDGET_MS,
  looksHadithCheck,
  quotedSegment,
  retrieve,
  type CaseFatwas,
  type RetrievalDiag,
  type WebLink,
} from "./retrieval";
import { ABSTAIN_AR, answerSystem, answerUser, type AnswerMode, type Passage } from "./prompts";
import type { FatwaCard } from "./fatwa-cards";
import { suggestQuestions } from "./suggest";
import { webLayer, type WebResult } from "./web";

/**
 * «عقل» مُستفتي من البداية إلى النهاية لرسالة واحدة:
 *   فحص الهوية بالكود ← التصنيف ← شبكة الأمان بالكود ← التوجيه:
 *   عاجل · خارج النطاق · هوية · D (فتاوى منشورة قريبة للاطلاع إن وُجدت، ثم الإحالة) ·
 *   A/B/C (استرجاع ← صياغة ← الحارس، مع «فتاوى منشورة ذات صلة» تحت الجواب).
 * لا امتناع جاف: إن لم تكفِ النصوص، تُعرض النصوص القريبة وأسئلة قريبة يمكن الجواب عنها، مع الإحالة.
 *
 * يستعمله /api/admin/brain-test الآن، ومسار المحادثة في S5. لا يُعرض للسائل إلا text،
 * و diag للمشرف فقط (لتشخيص الامتناع: هل البحث فارغ، أم امتنع النموذج، أم رُفضت الصياغة).
 */

export type ReplyKind = "identity" | "urgent" | "out_of_scope" | "referral" | "answer" | "abstain" | "refused";

/** سبب الامتناع (للتشخيص). */
export type AbstainReason = "no_passages" | "no_relevant" | "model_abstained" | "no_citation" | "guard";

export type BrainReply = {
  kind: ReplyKind;
  /** في الإحالة فقط: نوع رسالتها. */
  referral?: ReferralKind;
  /** ما يُعرض للسائل (صياغة الأداة بعد الحارس، أو رد ثابت). */
  text: string;
  lang: string;
  classification?: Classification;
  identityProbe: IdentityProbe | null;
  passages: Passage[];
  /** نتيجة الحارس على آخر صياغة مولّدة (إن وُجدت). */
  guard?: GuardResult;
  /** الصياغة الخام قبل الحارس (للمشرف فقط). */
  raw?: string;
  /** تجاوز الكود لقرار المصنّف (رفع المستوى أو العاجل). */
  overrides: string[];
  /**
   * فتاوى منشورة بنصها (مقتطف حرفي ورابط): تحت الجواب في A/B/C، وقبل الإحالة في D.
   * نص منقول لا كلام الأداة، فلا يمر بالحارس، ولا تلخّصه الأداة ولا تطبّقه على حالة السائل.
   */
  fatwas?: FatwaCard[];
  /** عند الامتناع: نصوص قريبة من السؤال (منقولة بحروفها). */
  related?: Passage[];
  /** عند الامتناع: أسئلة قريبة يجيب عنها نص مسترجع بعينه. */
  suggestions?: string[];
  /** سطر ثابت بعد بطاقات الفتاوى في D («الأفضل لحالتك أن يراها مختص»). */
  note?: string;
  /** روابط من المرجعية بلا اقتباس موثَّق («ابحث واقرأ»): تُعرض روابط فقط. */
  links?: WebLink[];
  /**
   * سؤال تحقق من حديث: عبارة البحث في الدرر، يطلبها متصفح السائل (لا الخادم ولا النموذج).
   * fallback: الرد سطر ثابت يسبق البطاقة (لا نص من المصادر الأخرى)، فإن لم تُعِد الدرر شيئاً
   * يعرض المتصفح الامتناع وزر الإحالة بدله.
   */
  hadithCheck?: { query: string; fallback?: boolean };
  diag: {
    retrieval?: RetrievalDiag;
    caseFatwas?: CaseFatwas["diag"];
    abstainReason?: AbstainReason;
    /** محاولات الصياغة (الثانية بعد اعتراض الحارس). */
    attempts: { raw: string; guardOk: boolean; findings: string[] }[];
  };
  timings: { classifyMs?: number; searchMs?: number; generateMs?: number; totalMs: number };
  costUsd: number;
};

/** جملة الامتناع بالعربية وبلغة السائل (بأي موضع في الرد). */
function abstainPhrases(lang: string): string[] {
  return [ABSTAIN_AR, message("abstain", lang)];
}

function hasAbstainPhrase(text: string, lang: string): boolean {
  const key = matchKey(text);
  return abstainPhrases(lang).some((p) => key.includes(matchKey(p)));
}

/**
 * امتناع حقيقي (R1e): جملة الامتناع **بلا** أي إشارة [n] صحيحة. وجملة الامتناع مع جواب بإشاراته
 * جواب جزئي (يُعرض بـ «ما وجدناه في المصادر:»)، لا امتناع.
 */
export function isAbstention(text: string, lang: string, count: number): boolean {
  return hasAbstainPhrase(text, lang) && validCitations(text, count).length === 0;
}

/** الإسناد: إشارة [n] صحيحة واحدة على الأقل، أو اقتباس حرفي موثَّق من النصوص (⟦Q⟧). */
function isGrounded(text: string, count: number, ownText: string): boolean {
  return validCitations(text, count).length > 0 || ownText.includes("⟦Q⟧");
}

type Generated = {
  text: string;
  raw: string;
  guard: GuardResult;
  ok: boolean;
  reason?: AbstainReason;
  /** جواب جزئي: كتب النموذج جملة الامتناع ثم أجاب من النصوص (حُذفت الجملة). */
  partial?: boolean;
  ms: number;
  cost: number;
  attempts: BrainReply["diag"]["attempts"];
};

/** حد رموز الجواب (يُضاف له حيّز التفكير في llm.ts إن كان مفعّلاً). */
const ANSWER_MAX_TOKENS = 1200;

/**
 * الصياغة من النصوص، ثم الحارس. كل النصوص المرسلة بلغت 60 في تقييم الصلة، فالأصل أن يُجاب منها:
 * محاولة ثانية واحدة إن اعترض الحارس، أو خالف شكل الجملة الأولى، أو امتنع النموذج، أو لم يُسند.
 * الامتناع لا يبقى إلا إن أصرّ عليه النموذج بعد التذكير بأن النصوص ذات صلة.
 */
async function generate(
  question: string,
  c: Classification,
  mode: AnswerMode,
  passages: Passage[],
  deadline = Date.now() + 60_000,
): Promise<Generated> {
  const input = { question, lang: c.lang, mode, passages, misconception: c.misconception, userType: c.userType };
  const messages: ChatMessage[] = [
    { role: "system", content: answerSystem(input) },
    { role: "user", content: answerUser(input) },
  ];
  const ctx = { sources: passages.map((p) => p.text), question, lang: c.lang };
  const attempts: Generated["attempts"] = [];
  const reasoning = reasoningFor("answer");
  let ms = 0;
  let cost = 0;
  const count = passages.length;

  // مهلة كل طلب: حتى 40 ث، أو ما بقي من الميزانية (12 ث على الأقل).
  const callMs = () => Math.min(40_000, Math.max(12_000, deadline - Date.now()));
  let res = await chat(messages, { temperature: 0.1, maxTokens: ANSWER_MAX_TOKENS, reasoning, timeoutMs: callMs() });
  ms += res.latencyMs;
  cost += res.usage.costUsd ?? 0;
  let raw = normalizeCitations(res.text.trim());
  let check = checkOutput(raw, ctx);
  const log = () =>
    attempts.push({
      raw,
      guardOk: !check.findings.length,
      findings: [...check.findings.map((f) => `${f.reason}: ${f.match}`), ...(res.finishReason && res.finishReason !== "stop" ? [`finish: ${res.finishReason}`] : [])],
    });
  log();

  const abstained = isAbstention(raw, c.lang, count);
  const ungrounded = !abstained && validCitations(raw, count).length === 0 && !check.ownText.includes("⟦Q⟧");
  const formatIssues = abstained ? [] : answerFormatIssues(raw);
  const needRetry = check.findings.length || formatIssues.length || abstained || ungrounded || !raw;
  // الإعادة لاعتراض الحارس دائماً (لا يُعرض المخالف)، وللشكل والامتناع إن بقي وقت.
  if (needRetry && (check.findings.length || deadline - Date.now() > 12_000)) {
    const issues = check.findings.map((f) => `- ${f.reason}: «${f.match}»`).join("\n");
    const fix = check.findings.length
      ? `Your reply was blocked by the safety check:\n${issues}\nRewrite it calmly and briefly. Do not write any ruling word (permissible, forbidden, halal, haram, يجوز، حرام…) in your own words: the sources may say it only inside a verbatim «quotation» from the passages with its [n]. Every quotation must be copied exactly from a passage. Do not attribute any hadith that is not quoted verbatim from a passage. Do not mention any AI model or company. Keep the ANSWER FORMAT.`
      : abstained || ungrounded || !raw
        ? `Every passage above was already judged RELEVANT to the question. Do not abstain: answer from them now, in ${c.lang}, covering only what they say (even if partial), in the ANSWER FORMAT, with a passage number like [1] after each statement (one number per bracket: [1][2], never [1, 2]). Abstain with the exact sentence only if truly NO passage says anything about the question.`
        : `Rewrite your reply in the ANSWER FORMAT: the first sentence must be a direct answer in your own plain words that ends with its [n] (not a quotation, not ﴿, not a reference); then the verbatim evidence with [n]. Keep every fact and quotation from the passages only.`;
    res = await chat(
      [...messages, { role: "assistant", content: raw || "(empty)" }, { role: "user", content: fix }],
      { temperature: 0, maxTokens: ANSWER_MAX_TOKENS, reasoning, timeoutMs: callMs() },
    );
    ms += res.latencyMs;
    cost += res.usage.costUsd ?? 0;
    raw = normalizeCitations(res.text.trim());
    check = checkOutput(raw, ctx);
    log();
  }

  // جملة الامتناع مع جواب مُسند: جواب جزئي، تُحذف الجملة ويسبقه «ما وجدناه في المصادر:».
  let partial = false;
  if (hasAbstainPhrase(raw, c.lang) && validCitations(raw, count).length) {
    const stripped = stripAbstainSentence(raw, abstainPhrases(c.lang));
    if (stripped && validCitations(stripped, count).length) {
      raw = stripped;
      partial = true;
    }
  }

  // التسجيل في guard_log والاستبدال بالرد الثابت إن بقيت المخالفة.
  const guard = await guardAndLog(raw, ctx);
  let reason: AbstainReason | undefined;
  if (!guard.ok) reason = "guard";
  else if (isAbstention(raw, c.lang, count)) reason = "model_abstained";
  else if (!isGrounded(raw, count, guard.ownText)) reason = "no_citation";
  return { text: guard.text, raw, guard, ok: !reason, reason, partial, ms, cost, attempts };
}

/** مراحل الرد (لمؤشر «يبحث في المصادر…» في المحادثة). */
export type BrainStage = "understanding" | "searching" | "reading" | "readingFatwa" | "verifying" | "writing";

/**
 * ميزانية السؤال كله (R1e، قرار حمدي: الجواب الكامل أهم من السرعة): 80 ث، وmaxDuration للمسار 120.
 * المصادر السريعة أولاً، و«ابحث واقرأ» بالتوازي (حتى 35 ث) ولا تُنتظر إلا إن لم تكفِ السريعة.
 * الاسترجاع حتى 55 ث، ثم الصياغة حتى نهاية الميزانية.
 */
export const QUESTION_BUDGET_MS = 80_000;
const RETRIEVAL_SHARE_MS = 55_000;
/** مهلة «ابحث واقرأ» من بداية السؤال (R1e: 35 ث). */
export const WEB_EARLY_MS = 35_000;

export type RespondOptions = {
  history?: ChatMessage[];
  /** يُستدعى عند بدء كل مرحلة (للبث فقط؛ لا يغيّر شيئاً في الرد). */
  onStage?: (stage: BrainStage) => void;
  /**
   * ذاكرة الأجوبة (المحادثة): السؤال نفسه بلغته يأخذ الجواب نفسه بمصادره فوراً، 24 ساعة.
   * لا تُخزَّن إلا الأجوبة (لا امتناع ولا رفض ولا خطأ)، ولا يُستعمل مع سياق محادثة سابق.
   */
  cache?: boolean;
};

const answerKey = (question: string) => `brain:answer:v3:${guessLang(question)}:${matchKey(question).slice(0, 400)}`;

export async function respond(question: string, options: RespondOptions = {}): Promise<BrainReply> {
  const started = Date.now();
  const stage = (s: BrainStage) => {
    try {
      options.onStage?.(s);
    } catch {
      /* المؤشر لا يوقف الرد */
    }
  };
  const overrides: string[] = [];
  const probe = detectIdentityProbe(question);
  const diag: BrainReply["diag"] = { attempts: [] };
  const base = { identityProbe: probe, passages: [] as Passage[], overrides, costUsd: 0, diag };
  type Draft = Pick<BrainReply, "kind" | "text" | "lang"> & Partial<BrainReply>;
  const done = (r: Draft): BrainReply => ({
    ...base,
    ...r,
    timings: { ...r.timings, totalMs: Date.now() - started },
  });

  const useCache = Boolean(options.cache) && !options.history?.length;
  if (useCache) {
    const hit = cacheGet<BrainReply>(answerKey(question));
    if (hit) return { ...hit, timings: { totalMs: Date.now() - started } };
  }

  // 1) «من أنت؟» و«ما النموذج؟»: رد ثابت بلا نموذج.
  if (probe === "who" || probe === "model") {
    const lang = guessLang(question);
    return done({ kind: "identity", text: identityReply(probe, lang), lang });
  }
  const prefix = probe === "manipulation" ? identityReply("manipulation", guessLang(question)) : "";
  const withPrefix = (text: string) => (prefix ? `${prefix}\n\n${text}` : text);

  // «ابحث واقرأ» تبدأ أول شيء، مع التصنيف (R1c): أبطأ المصادر، ونتيجتها تُنتظر في الاسترجاع.
  // وضع الفتاوى المشابهة للحالة الشخصية الظاهرة بالكود (D)، وإلا العام. لا تُطلب للعاجل.
  let webEarly: Promise<WebResult> | undefined;
  if (!looksUrgent(question)) {
    const mode = looksPersonal(question) || looksCaseRuling(question) ? "case" : "general";
    webEarly = webLayer(question, { mode, lang: guessLang(question), phrases: [], timeoutMs: WEB_EARLY_MS });
    webEarly.catch(() => null);
  }

  // 2) التصنيف + شبكة الأمان (ترفع ولا تخفض).
  stage("understanding");
  // خطة الإحالات تبدأ مع التصنيف (لا لحالة شخصية أو عاجلة)، وتُهمل إن صُنّف السؤال D.
  let plan: Promise<CitationPlan | null> | undefined;
  if (!looksPersonal(question) && !looksCaseRuling(question) && !looksUrgent(question)) {
    plan = planCitations(question);
  }
  const cls = await classify(question, { history: options.history });
  const c = { ...cls.classification };
  base.costUsd += cls.costUsd ?? 0;
  if (!c.urgent && looksUrgent(question)) {
    c.urgent = true;
    overrides.push("urgent:heuristic");
  }
  if (c.level !== "D" && looksPersonal(question)) {
    overrides.push(`level:${c.level}->D`);
    c.level = "D";
  }
  // «ما حكم من يسرق وهو مضطر؟»: حكم على واقعة فردية ⇒ D (يرفع ولا يخفض).
  if (c.level !== "D" && looksCaseRuling(question)) {
    overrides.push(`level:${c.level}->D:case-ruling`);
    c.level = "D";
  }
  // سؤال حكم عام بلا وقائع شخصية (لا في الرسالة ولا فيما سبقها من السائل) ليس D: B (R1b).
  const personalBefore = (options.history ?? []).some((m) => m.role === "user" && (looksPersonal(m.content) || looksPersonalFacts(m.content)));
  if (c.level === "D" && !personalBefore && looksGeneralRuling(question)) {
    overrides.push("level:D->B:general-ruling");
    c.level = "B";
  }
  const timings = { classifyMs: cls.latencyMs } as BrainReply["timings"];
  const common = { lang: c.lang, classification: c };

  if (c.urgent) return done({ ...common, kind: "urgent", text: message("urgent", c.lang), timings });
  if (c.aboutMustafti && !prefix && c.level !== "D") {
    return done({ ...common, kind: "identity", text: message("identityWho", c.lang), timings });
  }
  if (c.outOfScope) return done({ ...common, kind: "out_of_scope", text: withPrefix(message("outOfScope", c.lang)), timings });

  // 3) D: الإحالة فقط. لا نسترجع ولا نعرض أي دليل أو نص يمسّ مسألة السائل نفسها
  //    (عرض حديث في مسألته يشبه الفتوى). التعريف العام المحايد في رد الإحالة الثابت نفسه.
  //    نوعان: حالة شخصية («طلقت زوجتي…») أو سؤال عن حكم عام («ما حكم من…»)، ثم الاستيضاح
  //    وملف المسألة في المحادثة نفسها (lib/case/).
  //    المرشدة أجازت (R1): قبل الاستيضاح نبحث عن فتاوى منشورة مشابهة، فإن وُجد ما بلغ 60 (حتى 3)
  //    عُرض بنصه للاطلاع فقط مع رابطه، ثم «الأفضل لحالتك أن يراها مختص» وزر الاستيضاح نفسه.
  //    كلام الأداة هنا ردود ثابتة (messages.ts)، والحارس عليها وحدها لا على النص المنقول.
  if (c.level === "D") {
    const referral = referralKindOf(question);
    stage("searching");
    const t0 = Date.now();
    const found = await caseFatwas(c, question, {
      deadline: Math.min(Date.now() + CASE_FATWA_BUDGET_MS, started + RETRIEVAL_SHARE_MS),
      onReading: () => stage("readingFatwa"),
      web: webEarly,
    }).catch(() => null);
    timings.searchMs = Date.now() - t0;
    if (found) diag.caseFatwas = found.diag;
    if (found?.fatwas.length) {
      return done({
        ...common,
        kind: "referral",
        referral,
        text: withPrefix(message("fatwasFound", c.lang)),
        fatwas: found.fatwas,
        note: message("fatwasExpert", c.lang),
        timings,
      });
    }
    const text = message(referral === "ruling" ? "referralRuling" : "referral", c.lang);
    return done({ ...common, kind: "referral", referral, text: withPrefix(text), timings });
  }

  // 4) A / B / C: الاسترجاع.
  stage("searching");
  const t0 = Date.now();
  const found = await retrieve(c, question, plan, {
    replan: plan ? (failed) => planCitations(question, failed) : undefined,
    deadline: started + RETRIEVAL_SHARE_MS,
    onVerify: () => stage("verifying"),
    onReading: () => stage("reading"),
    web: webEarly,
  });
  timings.searchMs = Date.now() - t0;
  diag.retrieval = found.diag;
  const passages = found.passages;
  // التحقق من حديث: بطاقة الدرر من متصفح السائل (الخادم محجوب عنها)، بلا نموذج.
  const hadithQuery = looksHadithCheck(question) ? (quotedSegment(question) ?? arabicPhrases(c, question)[0]) : undefined;
  const shared: Partial<BrainReply> = {
    ...(found.links.length ? { links: found.links } : {}),
    ...(hadithQuery ? { hadithCheck: { query: hadithQuery } } : {}),
  };

  /**
   * لا امتناع جاف: «لم أجد جواباً كافياً» مع النصوص القريبة (منقولة بحروفها) والفتاوى ذات الصلة،
   * وأسئلة قريبة يجيب عنها نص منها، وزر الإحالة في الواجهة.
   */
  const partial = async (kind: "abstain" | "refused", head: string, extra: Partial<BrainReply> = {}) => {
    const related = (passages.length ? passages : found.related).slice(0, 3);
    const pool = [...related, ...found.fatwas.map((f) => ({ title: f.title, text: f.excerpt, source: `فتوى منشورة — ${f.mufti}` }))];
    const left = started + QUESTION_BUDGET_MS - Date.now();
    const suggestions = pool.length ? await suggestQuestions(question, c.lang, pool, left - 1_000) : [];
    const more = related.length || found.fatwas.length || suggestions.length ? `\n\n${message("partialFound", c.lang)}` : "";
    return done({
      ...common,
      timings,
      passages,
      ...shared,
      ...extra,
      kind,
      text: withPrefix(`${head}${more}`),
      related,
      fatwas: found.fatwas,
      suggestions,
    });
  };

  /**
   * التحقق من حديث (R1c): لا امتناع إن كان مع الرد بطاقة الدرر. السطر الثابت «هذه أحكام المحدّثين…»
   * يسبق البطاقة، والمتصفح يعرض الامتناع وزر الإحالة بدله إن لم تُعِد الدرر شيئاً (BotReply).
   */
  const hadithLine = (extra: Partial<BrainReply> = {}) =>
    done({
      ...common,
      timings,
      ...shared,
      ...extra,
      passages: [],
      kind: "answer",
      text: withPrefix(message("hadithFromDorar", c.lang)),
      hadithCheck: { query: hadithQuery!, fallback: true },
      fatwas: found.fatwas,
    });

  if (!passages.length) {
    if (hadithQuery) return hadithLine();
    diag.abstainReason = found.diag.counts.cleaned ? "no_relevant" : "no_passages";
    return partial("abstain", `${message("abstain", c.lang)} ${message("suggestExpert", c.lang)}`);
  }

  // 5) الصياغة من النصوص فقط، ثم الحارس.
  stage("writing");
  const gen = await generate(question, c, hadithQuery ? "hadith" : c.level === "C" ? "khilaf" : "general", passages, started + QUESTION_BUDGET_MS);
  timings.generateMs = gen.ms;
  base.costUsd += gen.cost;
  diag.attempts = gen.attempts;
  diag.abstainReason = gen.reason;
  const extra = { passages, guard: gen.guard, raw: gen.raw, timings };

  // التحقق من حديث بلا صياغة سليمة: السطر الثابت مع بطاقة الدرر بدل الامتناع.
  if (!gen.ok && hadithQuery) return hadithLine({ guard: gen.guard, raw: gen.raw });
  if (gen.reason === "guard") return partial("refused", gen.text, extra);
  if (!gen.ok) return partial("abstain", `${message("abstain", c.lang)} ${message("suggestExpert", c.lang)}`, extra);
  // نص الفهرس والقاموس مرجع يُحال إليه، لا اقتباس: يُزال من «» (والسطر المكرر يُحذف).
  const unquoted = unquoteReferenceOnly(gen.text, passages);
  const answer = gen.partial ? `${message("partialAnswer", c.lang)}\n${unquoted}` : unquoted;
  const body = c.level === "C" ? `${answer}\n\n${message("khilaf", c.lang)}` : answer;
  const reply = done({ ...common, ...shared, ...extra, kind: "answer", text: withPrefix(body), fatwas: found.fatwas });
  if (useCache && !prefix) cacheSet(answerKey(question), reply, DAY);
  return reply;
}

/**
 * فحص نهائي لما يُعرض (للاختبار): كلام الأداة كله (الرد، والسطر بعد بطاقات الفتاوى، والأسئلة
 * المقترحة)، مع النصوص المسترجعة. بطاقات الفتاوى والنصوص المنقولة ليست كلام الأداة فلا تُفحص.
 */
export function finalCheck(reply: BrainReply, question: string) {
  const own = [reply.text, reply.note ?? "", ...(reply.suggestions ?? [])].filter(Boolean).join("\n\n");
  const sources = [...reply.passages, ...(reply.related ?? [])].map((p) => `${p.title}\n${p.text}`);
  return checkOutput(own, { sources: [...sources, ...(reply.fatwas ?? []).map((f) => `${f.title}\n${f.excerpt}`)], question });
}
