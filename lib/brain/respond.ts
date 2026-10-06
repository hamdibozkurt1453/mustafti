import "server-only";

import { cacheGet, cacheSet, DAY } from "@/lib/cache";
import { z } from "zod";
import { chat, chatJson, chatStream, LlmError, reasoningFor, type ChatMessage } from "@/lib/llm";
import { classify, type Classification } from "./classify";
import {
  checkAnswer,
  checkOutput,
  isTruncated,
  matchKey,
  repairAnswer,
  replacementFor,
  separateQuoted,
  splitUnits,
  type AnswerFix,
  type GuardContext,
  type GuardFinding,
  type GuardResult,
} from "./guard";
import { personaFor, personaIssues, stripPersonaPhrases } from "./personas";
import { IDENTITY_PROMPT } from "./identity";
import {
  detectSmallTalk,
  smallTalkFallback,
  smallTalkInstruction,
  smallTalkSuggestions,
  validSmallTalkReply,
  type SmallTalkKind,
} from "./small-talk";
import { looksCaseRuling, looksGeneralRuling, looksGuidance, looksPersonal, looksPersonalFacts, looksUrgent, referralKindOf } from "./heuristics";
import { detectIdentityProbe, guessLang, identityReply, type IdentityProbe } from "./identity";
import { normalizeCitations, stripAbstainSentence, unquoteReferenceOnly, validCitations } from "./format";
import type { ReferralKind } from "@/lib/case/types";
import { message, type MessageKey } from "./messages";
import { modeUserType, type ChatMode } from "./modes";
import { planCitations, type CitationPlan } from "./planner";
import {
  arabicPhrases,
  caseFatwas,
  CASE_FATWA_BUDGET_MS,
  looksHadithCheck,
  prefetchFast,
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
import { ANSWER_CACHE_VERSION, readAnswerCache, writeAnswerCache } from "./answer-cache";
import { checklistBlock, checklistCoverage, mapChecklist, matchChecklist, type ChecklistCoverage } from "./howto-checklists";

/**
 * «عقل» مُستفتي من البداية إلى النهاية لرسالة واحدة:
 *   فحص الهوية بالكود ← التصنيف ← شبكة الأمان بالكود ← التوجيه:
 *   عاجل · خارج النطاق · هوية · D (فتاوى منشورة قريبة للاطلاع إن وُجدت، ثم الإحالة) ·
 *   A/B/C (استرجاع ← صياغة ← الحارس، مع «فتاوى منشورة ذات صلة» تحت الجواب).
 * R5c: الجواب من علم المساعد كاملاً، والمصادر المسترجعة تقوّيه بالدليل [n] حيث تنطبق (ولو لم يُسترجع
 * شيء يُجاب السؤال العام). الحارس يُعدِّل ولا يبتر (guard.ts)، ولا يُعرض جواب أقصر من 40% من المولّد.
 * لا امتناع جاف: إن امتنع النموذج رغم الإعادة، تُعرض النصوص القريبة وأسئلة قريبة، مع الإحالة.
 *
 * يستعمله /api/admin/brain-test الآن، ومسار المحادثة في S5. لا يُعرض للسائل إلا text،
 * و diag للمشرف فقط (لتشخيص الامتناع: هل البحث فارغ، أم امتنع النموذج، أم رُفضت الصياغة).
 */

export type ReplyKind = "identity" | "urgent" | "out_of_scope" | "referral" | "answer" | "abstain" | "refused" | "chitchat";

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
  timings: BrainTimings;
  costUsd: number;
  /** R5: الجواب عرض خلافاً فقهياً معتبراً (شارة «مسألة خلافية» وسطرها). */
  khilaf?: boolean;
  /** R5: العبارات الممنوعة في الشخصية إن بقيت (لـ «فحص الشخصية» في صفحة الفحص). */
  persona?: string[];
  /** R5: الجواب بُث إلى الواجهة أثناء كتابته (المسار يرسل بعده الجواب النهائي في حدث final). */
  streamed?: boolean;
  /** R5b: «الاكتمال» في السؤال العملي: عناصر القائمة المذكورة في الجواب ونسبتها. */
  checklist?: ChecklistCoverage;
};

/**
 * زمن كل مرحلة (R5): التصنيف، والمصادر السريعة، و«ابحث واقرأ»، والترتيب (تقييم الصلة)، والصياغة
 * (وأول جزء منها)، والكل. يُسجَّل في سجلات الخادم ويُعرض في صفحة الفحص.
 */
export type BrainTimings = {
  classifyMs?: number;
  searchMs?: number;
  fastMs?: number;
  webMs?: number;
  rerankMs?: number;
  rerankSkipped?: boolean;
  generateMs?: number;
  /** من بداية السؤال إلى أول كلمة من الجواب. */
  firstTokenMs?: number;
  totalMs: number;
  /** الجواب من ذاكرة الأجوبة: داخل نسخة الخادم، أو جدول answer_cache. */
  cached?: "memory" | "db";
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

type Generated = {
  text: string;
  raw: string;
  guard: GuardResult;
  ok: boolean;
  reason?: AbstainReason;
  /** جواب جزئي: كتب النموذج جملة الامتناع ثم أجاب من النصوص (حُذفت الجملة). */
  partial?: boolean;
  ms: number;
  /** زمن أول جزء من الجواب (البث)، أو زمن المحاولة الأولى كاملة بلا بث. */
  firstTokenMs?: number;
  /** ما عدّله الحارس (اقتباس صُحح أو لُيّن، ونسبة لُيّنت، وجملة اسم نموذج أو مسيء حُذفت). */
  fixes: AnswerFix[];
  /** العبارات الممنوعة في الشخصية (تبقى إن تعذّرت الإعادة؛ صفحة الفحص تعرضها). */
  persona: string[];
  cost: number;
  attempts: BrainReply["diag"]["attempts"];
};

/** حد رموز الجواب (يُضاف له حيّز التفكير في llm.ts إن كان مفعّلاً). R5: الجواب الحر أطول. */
const ANSWER_MAX_TOKENS = 1600;
/** R5b: الجواب العملي الكامل (خطوات بذكرها العربي ونطقه ومعناه) أطول. */
const CHECKLIST_MAX_TOKENS = 2600;

/** البث إلى المحادثة (R5): أجزاء الجواب بعد فحص كل جملة، و«ابدأ من جديد» قبل المحاولة الثانية. */
export type StreamHooks = {
  onDelta?: (text: string) => void;
  onReset?: () => void;
};

/** بقية لم تكتمل قد تكون إشارة [n] للجملة السابقة: لا تُرسل الجملة قبلها بعد. */
const MAYBE_CITE = /^\s*(?:\[\s*\d{0,2}\s*\]?\s*)*$/;

/**
 * بث محاولة واحدة: الجواب يُجمع ويُرسل جملةً جملة، وكل جملة تمر بالحارس نفسه الذي يجري على الجواب
 * كاملاً (repairAnswer): الاقتباس المنسوب غير المطابق يُصحَّح أو يُليَّن، وجملة اسم النموذج أو المسيء
 * لا تُرسل، والفتوى الشخصية توقف البث (والجواب النهائي في حدث final يحل محل ما بُث).
 */
async function streamAttempt(
  messages: ChatMessage[],
  opts: Parameters<typeof chat>[1],
  ctx: GuardContext,
  emit: (text: string) => void,
): Promise<{ text: string; latencyMs: number; firstTokenMs?: number; cost: number }> {
  const started = Date.now();
  let full = "";
  let sent = 0;
  let halted = false;
  let firstTokenMs: number | undefined;
  const flush = (final: boolean) => {
    const units = splitUnits(full.slice(sent));
    let ready = final ? units.length : units.length - 1;
    if (!final && ready > 0 && MAYBE_CITE.test(units[units.length - 1] ?? "")) ready -= 1;
    for (const unit of units.slice(0, Math.max(0, ready))) {
      sent += unit.length;
      if (halted) continue;
      const norm = stripPersonaPhrases(normalizeCitations(unit));
      const r = repairAnswer(norm, ctx);
      if (r.blocked.length) {
        halted = true;
        continue;
      }
      if (!r.fixes.length) {
        emit(norm);
        continue;
      }
      const lead = norm.match(/^\s*/)?.[0] ?? "";
      const tail = norm.match(/\s*$/)?.[0] ?? "";
      if (r.text) emit(`${lead}${r.text}${tail}`);
      else if (tail.includes("\n")) emit("\n");
    }
  };
  const gen = chatStream(messages, opts);
  let step = await gen.next();
  while (!step.done) {
    if (firstTokenMs === undefined) firstTokenMs = Date.now() - started;
    full += step.value;
    flush(false);
    step = await gen.next();
  }
  flush(true);
  return { text: full, latencyMs: Date.now() - started, firstTokenMs, cost: step.value?.usage.costUsd ?? 0 };
}

/**
 * الصياغة ثم الحارس على الجواب الكامل (R5c):
 *   - الجواب كامل من علم المساعد بصوت الشخصية، والمصادر [n] تقوّيه حيث تنطبق (لا شرط لكل جملة).
 *   - repairAnswer يُعدِّل ولا يبتر: الاقتباس المنسوب يُصحَّح أو يُليَّن، وجملة اسم النموذج أو المسيء
 *     تُحذف وحدها، والفتوى الشخصية تمنع الجواب.
 *   - محاولة ثانية واحدة إن مُنع الجواب (فتوى شخصية)، أو صار بعد التعديل أقصر من 40% من المولّد،
 *     أو امتنع النموذج، أو تكلم كطرف محايد («أكثر من صياغة»)، وبقي وقت.
 *   - لا يُعرض جواب أقصر من 40% من المولّد أبداً: يحل محله الرد الثابت (isTruncated).
 * مع hooks.onDelta يُبث الجواب جملةً جملة (أول محاولة وثانيتها بعد onReset).
 */
async function generate(
  question: string,
  c: Classification,
  mode: AnswerMode,
  passages: Passage[],
  deadline = Date.now() + 60_000,
  chatMode: ChatMode = "general",
  hooks: StreamHooks = {},
  checklist?: string,
): Promise<Generated> {
  const input = { question, lang: c.lang, mode, passages, misconception: c.misconception, userType: c.userType, chatMode, checklist };
  const messages: ChatMessage[] = [
    { role: "system", content: answerSystem(input) },
    { role: "user", content: answerUser(input) },
  ];
  const count = passages.length;
  const ctx: GuardContext = { sources: passages.map((p) => p.text), question, lang: c.lang, citeCount: count };
  const attempts: Generated["attempts"] = [];
  const reasoning = reasoningFor("answer");
  let ms = 0;
  let cost = 0;
  let firstTokenMs: number | undefined;

  // مهلة كل طلب: حتى 40 ث، أو ما بقي من الميزانية (12 ث على الأقل). لا قطع يُنتج جواباً ناقصاً.
  const callMs = () => Math.min(40_000, Math.max(12_000, deadline - Date.now()));
  const call = async (msgs: ChatMessage[], temperature: number): Promise<string> => {
    const opts = { temperature, maxTokens: checklist ? CHECKLIST_MAX_TOKENS : ANSWER_MAX_TOKENS, reasoning, timeoutMs: callMs() };
    if (hooks.onDelta) {
      try {
        const r = await streamAttempt(msgs, opts, ctx, hooks.onDelta);
        ms += r.latencyMs;
        cost += r.cost;
        if (firstTokenMs === undefined) firstTokenMs = r.firstTokenMs;
        return r.text;
      } catch (error) {
        // انقطع البث: محاولة كاملة بلا بث (الواجهة تأخذ الجواب النهائي في حدث final).
        if (!(error instanceof LlmError)) throw error;
        hooks.onReset?.();
      }
    }
    const res = await chat(msgs, opts);
    ms += res.latencyMs;
    cost += res.usage.costUsd ?? 0;
    if (firstTokenMs === undefined) firstTokenMs = res.latencyMs;
    return res.text;
  };

  /** تقييم محاولة: الحارس، والامتناع، والبتر (أقصر من 40% من المولّد)، وصوت الشخصية. */
  const evaluate = (rawText: string) => {
    const raw = normalizeCitations(rawText.trim());
    const repair = repairAnswer(stripPersonaPhrases(raw), ctx);
    const abstained = isAbstention(raw, c.lang, count);
    const truncated = isTruncated(raw, repair.text);
    const persona = personaIssues(repair.text);
    attempts.push({
      raw,
      guardOk: !repair.blocked.length && !repair.fixes.length,
      findings: [
        ...repair.blocked.map((f) => `${f.reason}: ${f.match}`),
        ...repair.fixes.map((f) => `${f.kind}: ${f.match}`),
        ...persona.map((p) => `persona: ${p}`),
      ],
    });
    return { raw, repair, abstained, truncated, persona };
  };

  let e = evaluate(await call(messages, 0.3));
  const hard = (x: typeof e) => Boolean(x.repair.blocked.length || x.truncated);
  const needRetry = (x: typeof e) => Boolean(hard(x) || x.abstained || !x.raw || x.persona.length);
  // الإعادة لما يمنع الجواب دائماً، ولغيره إن بقي وقت.
  if (needRetry(e) && (hard(e) || deadline - Date.now() > 12_000)) {
    const removed = e.repair.fixes.filter((f) => f.kind === "sentence_removed");
    const fix = e.repair.blocked.length
      ? `Your reply was blocked by the safety check:\n${e.repair.blocked.map((f) => `- personal ruling: «${f.match}»`).join("\n")}\nRewrite it as a complete GENERAL answer: never apply a ruling to the asker's own case and never say their act, worship, contract or divorce is valid, invalid or has occurred. Keep your persona's voice and keep every useful step and explanation.`
      : e.truncated
        ? `Your reply contained words that cannot be shown (${removed.map((f) => `«${f.match}»`).join("، ")}): never mention any AI model or company, and never use insulting words. Rewrite the COMPLETE answer without them, in your persona's voice.`
        : e.abstained || !e.raw
          ? `Do not abstain. Answer the question now, fully and completely, from your own sound Islamic knowledge, in ${c.lang}, in your persona's voice. Cite a passage number [n] wherever a passage supports what you say (one number per bracket: [1][2]); sentences without a passage need no number. Decline only a personal fatwa about the asker's own case.`
          : `Rewrite your answer in your persona's direct, confident voice. Never write «تذكر المصادر…», «هناك أكثر من صياغة» or "the sources mention": state what Islam teaches directly, with [n] where a passage supports it. Keep the answer complete.`;
    hooks.onReset?.();
    const second = evaluate(await call([...messages, { role: "assistant", content: e.raw || "(empty)" }, { role: "user", content: fix }], 0));
    // المحاولة الثانية تُعتمد إلا إن كانت أسوأ (مُنعت أو بُترت أو امتنعت والأولى سليمة من ذلك).
    const worse = (hard(second) && !hard(e)) || (second.abstained && !e.abstained && !hard(e));
    // إن رأت الواجهة الثانية والأولى أفضل، فحدث final في المحادثة يعيد الأولى.
    if (!worse) e = second;
  }

  let text = e.repair.text;
  // جملة الامتناع مع جواب مُسند: جواب جزئي، تُحذف الجملة ويسبقه «ما وجدناه في المصادر:».
  let partial = false;
  if (hasAbstainPhrase(text, c.lang) && validCitations(text, count).length) {
    const stripped = stripAbstainSentence(text, abstainPhrases(c.lang));
    if (stripped && validCitations(stripped, count).length) {
      text = stripped;
      partial = true;
    }
  }

  // التسجيل في guard_log (ما مُنع وما عُدّل)، والاستبدال بالرد الثابت إن بقي ما يمنع الجواب:
  // فتوى شخصية، أو جواب صار أقصر من 40% من المولّد (لا يُعرض مبتوراً أبداً).
  const fixFindings: GuardFinding[] = e.repair.fixes.map((f) => ({ reason: f.reason, lang: "*", match: `${f.kind}: ${f.match}` }));
  const findings: GuardFinding[] = [...e.repair.blocked, ...fixFindings];
  const blocked = hard(e);
  const guard: GuardResult = {
    ok: !blocked,
    text: blocked ? replacementFor(e.repair.blocked.length ? e.repair.blocked : fixFindings.filter((f) => f.match.startsWith("sentence_removed")), c.lang) : text,
    original: e.raw,
    findings,
    ownText: separateQuoted(text, ctx).ownText,
  };
  if (findings.length) await logGuardSafe(guard);
  let reason: AbstainReason | undefined;
  if (blocked) reason = "guard";
  else if (isAbstention(e.raw, c.lang, count) && !validCitations(text, count).length) reason = "model_abstained";
  else if (!text) reason = "no_citation";
  return {
    text: guard.text,
    raw: e.raw,
    guard,
    ok: !reason,
    reason,
    partial,
    ms,
    firstTokenMs,
    fixes: e.repair.fixes,
    persona: e.persona,
    cost,
    attempts,
  };
}

/** التسجيل في guard_log لا يوقف الجواب أبداً. */
async function logGuardSafe(result: GuardResult): Promise<void> {
  try {
    const { logGuard } = await import("./guard-log");
    await logGuard(result, null);
  } catch {
    /* السجل تشخيص فقط */
  }
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
   * ذاكرة الأجوبة (المحادثة): السؤال نفسه بلغته ووضعه يأخذ الجواب نفسه بمصادره فوراً: داخل نسخة
   * الخادم، ثم جدول answer_cache لمدة 7 أيام (R5). لا تُخزَّن إلا الأجوبة (لا امتناع ولا رفض ولا
   * خطأ)، ولا يُستعمل مع سياق محادثة سابق.
   */
  cache?: boolean;
  /** مهمة بعد الرد (كتابة الذاكرة الدائمة): after() في المسار، وإلا تُطلق بلا انتظار. */
  defer?: (task: () => Promise<void>) => void;
  /**
   * البث (R5): onSources حين تجهز المصادر (قبل الصياغة)، ثم onDelta لكل جملة مفحوصة من الجواب،
   * وonReset قبل محاولة ثانية. الجواب النهائي بعد التحقق الكامل هو ما يعيده respond().
   */
  onSources?: (preview: AnswerPreview) => void;
  onDelta?: (text: string) => void;
  onReset?: () => void;
  /**
   * وضع المحادثة (R3): «المرشد» في /new-muslim، و«الداعية» في /discover. يغيّر ترتيب المصادر
   * ونبرة الصياغة ونوع السائل فقط؛ الهوية والتصنيف والعاجل والإحالة والحارس والامتناع كما هي.
   */
  mode?: ChatMode;
};

/** ما يلزم الواجهة لعرض المصادر قبل الجواب (R5). */
export type AnswerPreview = Pick<BrainReply, "lang" | "classification" | "passages" | "fatwas" | "links" | "hadithCheck" | "khilaf">;

const answerKey = (question: string, mode: ChatMode) =>
  `brain:answer:${ANSWER_CACHE_VERSION}:${mode === "general" ? "" : `${mode}:`}${guessLang(question)}:${matchKey(question).slice(0, 400)}`;

/** ما يُخزَّن من الجواب في الذاكرة الدائمة: بلا تشخيص ولا صياغة خام. */
function cacheable(reply: BrainReply): BrainReply {
  return { ...reply, raw: undefined, guard: undefined, diag: { attempts: [] }, timings: { totalMs: reply.timings.totalMs } };
}

/** باب فقهي (لا «أخرى» ولا «المسلم الجديد»): الخلاف فيه خلاف فقهي معتبر. */
function isFiqh(c: Classification): boolean {
  return Boolean(c.chapter && c.chapter !== "other" && c.chapter !== "new_muslim");
}

/** سطر ما بعد الامتناع: «أرسل سؤالك إلى مختص»، أو «مرشد» للمسلم الجديد، أو «داعية» لغير المسلم. */
export function suggestKey(mode: ChatMode): MessageKey {
  return mode === "new_muslim" ? "suggestMentor" : mode === "discover" ? "suggestDaee" : "suggestExpert";
}

/** مهلة رد الشخصية على المحادثة العادية؛ بعدها الرد الاحتياطي الثابت. */
const SMALL_TALK_MS = 7_000;

const SmallTalkSchema = z.object({ reply: z.string(), suggestions: z.array(z.string()).max(3) });

/**
 * F2b: المحادثة العادية (تحية، شكر، وداع، سؤال عن المنصة، كلام عادي): بلا تصنيف ولا استرجاع ولا حارس.
 * شخصية الصفحة ترد رداً قصيراً دافئاً بلغة السائل مع 3 أسئلة مقترحة؛ وإن تعذّر ذلك أو ذكر الرد نموذجاً
 * أو مزوّداً، فالرد الثابت بلغة السائل.
 */
async function smallTalk(question: string, kind: SmallTalkKind, mode: ChatMode, history: ChatMessage[] = []) {
  const lang = guessLang(question);
  const fallback = { text: smallTalkFallback(kind, mode, lang), suggestions: smallTalkSuggestions(mode, lang), costUsd: 0, lang };
  try {
    const persona = personaFor(mode);
    const res = await chatJson(
      [
        { role: "system", content: `${IDENTITY_PROMPT}\n\n${persona.system}\n\n${smallTalkInstruction(kind)}` },
        ...history.slice(-4).map((m) => ({ ...m, content: m.content.slice(0, 600) })),
        { role: "user", content: question.slice(0, 300) },
      ],
      SmallTalkSchema,
      { temperature: 0.6, schemaName: "small_talk", maxTokens: 400, timeoutMs: SMALL_TALK_MS },
    );
    const reply = res.data.reply.trim();
    if (!validSmallTalkReply(reply)) return fallback;
    const suggestions = res.data.suggestions.map((q) => q.trim()).filter((q) => q && q.length <= 140 && validSmallTalkReply(q));
    return { text: reply, suggestions: suggestions.length === 3 ? suggestions : fallback.suggestions, costUsd: res.usage.costUsd ?? 0, lang };
  } catch {
    return fallback;
  }
}

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

  const chatMode = options.mode ?? "general";
  const useCache = Boolean(options.cache) && !options.history?.length;
  if (useCache) {
    const hit = cacheGet<BrainReply>(answerKey(question, chatMode));
    if (hit) return { ...hit, streamed: false, timings: { totalMs: Date.now() - started, cached: "memory" } };
    const stored = await readAnswerCache<BrainReply>(question, chatMode, guessLang(question));
    if (stored?.kind === "answer" && stored.text) {
      cacheSet(answerKey(question, chatMode), stored, DAY);
      return { ...stored, streamed: false, diag: { attempts: [] }, timings: { totalMs: Date.now() - started, cached: "db" } };
    }
  }

  // 0) F2b: المحادثة العادية إلى شخصية الصفحة مباشرة (لا مصنّف ولا استرجاع ولا حارس). سؤال النموذج والتلاعب لهما ردهما الثابت.
  const talk = probe === "model" || probe === "manipulation" ? null : detectSmallTalk(question);
  if (talk) {
    const r = await smallTalk(question, talk, chatMode, options.history);
    base.costUsd += r.costUsd;
    return done({ kind: "chitchat", text: r.text, lang: r.lang, suggestions: r.suggestions });
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

  // R5: المصدران المحليان السريعان بالسؤال نفسه يبدآن مع التصنيف (لا بعده).
  const prefetch = !looksUrgent(question) && !looksPersonal(question) ? prefetchFast(question, guessLang(question)) : undefined;

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
  // الوضع الموجّه: نوع السائل من الصفحة (المصنّف لا يعرفها).
  const typed = modeUserType(chatMode, c.userType);
  if (typed) {
    overrides.push(`userType:${c.userType}->${typed}:mode`);
    c.userType = typed as Classification["userType"];
  }
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
  // سؤال إرشاد عملي عام («كيف أصلي؟»، "How should I treat my parents?") ليس D ولو ذكر السائل نفسه (R5b).
  if (c.level === "D" && looksGuidance(question)) {
    overrides.push("level:D->B:guidance");
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

  // 4) A / B / C: الاسترجاع. R5b: السؤال العملي («كيف أصلي؟») يأخذ قائمة عناصره الواجبة وبحوثها
  //    الفرعية (المحادثة العامة و«المرشد»؛ لا «الداعية»).
  const list = chatMode !== "discover" ? matchChecklist(question) : null;
  stage("searching");
  const t0 = Date.now();
  const found = await retrieve(c, question, plan, {
    replan: plan ? (failed) => planCitations(question, failed) : undefined,
    deadline: started + RETRIEVAL_SHARE_MS,
    onVerify: () => stage("verifying"),
    onReading: () => stage("reading"),
    web: webEarly,
    mode: chatMode,
    prefetch,
    checklist: list ?? undefined,
  });
  timings.searchMs = Date.now() - t0;
  diag.retrieval = found.diag;
  const st = found.diag.stages;
  if (st) {
    timings.fastMs = st.fastMs;
    timings.rerankMs = st.rerank1Ms + (st.rerank2Ms ?? 0);
    if (st.rerankSkipped) timings.rerankSkipped = true;
  }
  if (found.diag.web) timings.webMs = found.diag.web.ms;
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

  // التحقق من حديث بلا نص مسترجع: بطاقة الدرر (أحكام المحدّثين) لا علم النموذج.
  if (!passages.length && hadithQuery) return hadithLine();

  // 5) الصياغة (R5c): جواب كامل من علم المساعد بصوت الشخصية، والنصوص المسترجعة تقوّيه بالدليل [n]
  //    حيث تنطبق. بلا نصوص مسترجعة يُجاب السؤال العام أيضاً (المصادر شرف للجواب لا شرط له).
  //    الخلاف الفقهي المعتبر لسؤال C في باب فقهي فقط؛ والشبهة في «الداعية» تُرد ولا تُعرض خلافاً.
  const khilaf = !hadithQuery && c.level === "C" && chatMode !== "discover" && isFiqh(c);
  stage("writing");
  const streaming = Boolean(options.onDelta);
  if (streaming) {
    try {
      options.onSources?.({ lang: c.lang, classification: c, passages, fatwas: found.fatwas, links: found.links, hadithCheck: shared.hadithCheck, khilaf });
    } catch {
      /* البث لا يوقف الرد */
    }
  }
  const genStarted = Date.now();
  const block = list ? checklistBlock(list, mapChecklist(list, passages), c.lang) : undefined;
  const gen = await generate(
    question,
    c,
    hadithQuery ? "hadith" : khilaf ? "khilaf" : "general",
    passages,
    started + QUESTION_BUDGET_MS,
    chatMode,
    { onDelta: options.onDelta, onReset: options.onReset },
    block,
  );
  timings.generateMs = gen.ms;
  if (gen.firstTokenMs !== undefined) timings.firstTokenMs = genStarted - started + gen.firstTokenMs;
  base.costUsd += gen.cost;
  diag.attempts = gen.attempts;
  diag.abstainReason = gen.reason;
  const extra = { passages, guard: gen.guard, raw: gen.raw, timings, streamed: streaming, ...(gen.persona.length ? { persona: gen.persona } : {}) };

  // التحقق من حديث بلا صياغة سليمة: السطر الثابت مع بطاقة الدرر بدل الامتناع.
  if (!gen.ok && hadithQuery) return hadithLine({ guard: gen.guard, raw: gen.raw });
  if (gen.reason === "guard") return partial("refused", gen.text, extra);
  if (!gen.ok) {
    if (!passages.length) diag.abstainReason = found.diag.counts.cleaned ? "no_relevant" : "no_passages";
    return partial("abstain", `${message("abstain", c.lang)} ${message(suggestKey(chatMode), c.lang)}`, extra);
  }
  // نص الفهرس والقاموس مرجع يُحال إليه، لا اقتباس: يُزال من «» (والسطر المكرر يُحذف).
  const unquoted = unquoteReferenceOnly(gen.text, passages);
  const answer = gen.partial ? `${message("partialAnswer", c.lang)}\n${unquoted}` : unquoted;
  const body = khilaf ? `${answer}\n\n${message("khilaf", c.lang)}` : answer;
  const reply = done({
    ...common,
    ...shared,
    ...extra,
    kind: "answer",
    text: withPrefix(body),
    fatwas: found.fatwas,
    khilaf,
    ...(list ? { checklist: checklistCoverage(list, body) } : {}),
  });
  if (useCache && !prefix && !gen.persona.length) {
    cacheSet(answerKey(question, chatMode), cacheable(reply), DAY);
    const save = () => writeAnswerCache(question, chatMode, guessLang(question), cacheable(reply));
    if (options.defer) options.defer(save);
    else void save();
  }
  return reply;
}

/**
 * فحص نهائي لما يُعرض (للاختبار): كلام الأداة كله (الرد، والسطر بعد بطاقات الفتاوى، والأسئلة
 * المقترحة)، مع النصوص المسترجعة. بطاقات الفتاوى والنصوص المنقولة ليست كلام الأداة فلا تُفحص.
 * R5c: الجواب يُفحص بحارس الجواب (اقتباس منسوب بلا أصل، فتوى شخصية، اسم نموذج، مسيء)، وبقية كلام
 * الأداة بالحارس الصارم.
 */
export function finalCheck(reply: BrainReply, question: string) {
  const sources = [...reply.passages, ...(reply.related ?? [])].map((p) => `${p.title}\n${p.text}`);
  const all = [...sources, ...(reply.fatwas ?? []).map((f) => `${f.title}\n${f.excerpt}`)];
  const rest = [reply.note ?? "", ...(reply.suggestions ?? [])].filter(Boolean).join("\n\n");
  if (reply.kind === "answer") {
    const answer = checkAnswer(reply.text, { sources: all, question, citeCount: reply.passages.length });
    const other = rest ? checkOutput(rest, { sources: all, question }).findings : [];
    return { findings: [...answer.findings, ...other], ownText: answer.ownText };
  }
  const own = [reply.text, rest].filter(Boolean).join("\n\n");
  return checkOutput(own, { sources: all, question });
}
