import "server-only";

import { chat, type ChatMessage } from "@/lib/llm";
import { classify, type Classification } from "./classify";
import { checkOutput, guardAndLog, matchKey, type GuardResult } from "./guard";
import { looksPersonal, looksUrgent } from "./heuristics";
import { detectIdentityProbe, guessLang, identityReply, type IdentityProbe } from "./identity";
import { message } from "./messages";
import { retrieve, type RetrievalDiag } from "./retrieval";
import { ABSTAIN_AR, answerSystem, answerUser, type AnswerMode, type Passage } from "./prompts";

/**
 * «عقل» مُستفتي من البداية إلى النهاية لرسالة واحدة:
 *   فحص الهوية بالكود ← التصنيف ← شبكة الأمان بالكود ← التوجيه:
 *   عاجل · خارج النطاق · هوية · D (إحالة فقط) · A/B/C (استرجاع ← صياغة ← الحارس).
 *
 * يستعمله /api/admin/brain-test الآن، ومسار المحادثة في S5. لا يُعرض للسائل إلا text،
 * و diag للمشرف فقط (لتشخيص الامتناع: هل البحث فارغ، أم امتنع النموذج، أم رُفضت الصياغة).
 */

export type ReplyKind = "identity" | "urgent" | "out_of_scope" | "referral" | "answer" | "abstain" | "refused";

/** سبب الامتناع (للتشخيص). */
export type AbstainReason = "no_passages" | "no_relevant" | "model_abstained" | "no_citation" | "guard";

export type BrainReply = {
  kind: ReplyKind;
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
  diag: {
    retrieval?: RetrievalDiag;
    abstainReason?: AbstainReason;
    /** محاولات الصياغة (الثانية بعد اعتراض الحارس). */
    attempts: { raw: string; guardOk: boolean; findings: string[] }[];
  };
  timings: { classifyMs?: number; searchMs?: number; generateMs?: number; totalMs: number };
  costUsd: number;
};

function isAbstention(text: string, lang: string): boolean {
  const key = matchKey(text);
  return key.includes(matchKey(ABSTAIN_AR)) || key.includes(matchKey(message("abstain", lang)));
}

/** الإسناد: إشارة [n] صحيحة واحدة على الأقل، أو اقتباس حرفي موثَّق من النصوص (⟦Q⟧). */
function isGrounded(text: string, count: number, ownText: string): boolean {
  const refs = [...text.matchAll(/[\[(（]\s*(\d{1,2})\s*[\])）]/g)].map((m) => Number(m[1]));
  const validRefs = refs.length > 0 && refs.every((n) => n >= 1 && n <= count);
  return validRefs || ownText.includes("⟦Q⟧");
}

type Generated = {
  text: string;
  raw: string;
  guard: GuardResult;
  ok: boolean;
  reason?: AbstainReason;
  ms: number;
  cost: number;
  attempts: BrainReply["diag"]["attempts"];
};

async function generate(question: string, c: Classification, mode: AnswerMode, passages: Passage[]): Promise<Generated> {
  const input = { question, lang: c.lang, mode, passages, misconception: c.misconception, userType: c.userType };
  const messages: ChatMessage[] = [
    { role: "system", content: answerSystem(input) },
    { role: "user", content: answerUser(input) },
  ];
  const ctx = { sources: passages.map((p) => p.text), question, lang: c.lang };
  const attempts: Generated["attempts"] = [];
  let ms = 0;
  let cost = 0;

  let res = await chat(messages, { temperature: 0.1, maxTokens: 900 });
  ms += res.latencyMs;
  cost += res.usage.costUsd ?? 0;
  let raw = res.text.trim();
  let check = checkOutput(raw, ctx);
  attempts.push({ raw, guardOk: !check.findings.length, findings: check.findings.map((f) => `${f.reason}: ${f.match}`) });

  // اعتراض الحارس: محاولة ثانية واحدة تذكر للنموذج العبارة المخالفة، ثم الحارس من جديد.
  if (check.findings.length) {
    const issues = check.findings.map((f) => `- ${f.reason}: «${f.match}»`).join("\n");
    res = await chat(
      [
        ...messages,
        { role: "assistant", content: raw },
        {
          role: "user",
          content: `Your reply was blocked by the safety check:\n${issues}\nRewrite it calmly and briefly. Do not write any ruling word (permissible, forbidden, halal, haram, يجوز، حرام…) in your own words: the sources may say it only inside a verbatim «quotation» from the passages with its [n]. Every quotation must be copied exactly from a passage. Do not attribute any hadith that is not quoted verbatim from a passage. Do not mention any AI model or company.`,
        },
      ],
      { temperature: 0, maxTokens: 900 },
    );
    ms += res.latencyMs;
    cost += res.usage.costUsd ?? 0;
    raw = res.text.trim();
    check = checkOutput(raw, ctx);
    attempts.push({ raw, guardOk: !check.findings.length, findings: check.findings.map((f) => `${f.reason}: ${f.match}`) });
  }

  // التسجيل في guard_log والاستبدال بالرد الثابت إن بقيت المخالفة.
  const guard = await guardAndLog(raw, ctx);
  let reason: AbstainReason | undefined;
  if (!guard.ok) reason = "guard";
  else if (isAbstention(raw, c.lang)) reason = "model_abstained";
  else if (!isGrounded(raw, passages.length, guard.ownText)) reason = "no_citation";
  return { text: guard.text, raw, guard, ok: !reason, reason, ms, cost, attempts };
}

export async function respond(question: string, options: { history?: ChatMessage[] } = {}): Promise<BrainReply> {
  const started = Date.now();
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

  // 1) «من أنت؟» و«ما النموذج؟»: رد ثابت بلا نموذج.
  if (probe === "who" || probe === "model") {
    const lang = guessLang(question);
    return done({ kind: "identity", text: identityReply(probe, lang), lang });
  }
  const prefix = probe === "manipulation" ? identityReply("manipulation", guessLang(question)) : "";
  const withPrefix = (text: string) => (prefix ? `${prefix}\n\n${text}` : text);

  // 2) التصنيف + شبكة الأمان (ترفع ولا تخفض).
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
  const timings = { classifyMs: cls.latencyMs } as BrainReply["timings"];
  const common = { lang: c.lang, classification: c };

  if (c.urgent) return done({ ...common, kind: "urgent", text: message("urgent", c.lang), timings });
  if (c.aboutMustafti && !prefix && c.level !== "D") {
    return done({ ...common, kind: "identity", text: message("identityWho", c.lang), timings });
  }
  if (c.outOfScope) return done({ ...common, kind: "out_of_scope", text: withPrefix(message("outOfScope", c.lang)), timings });

  // 3) D: الإحالة فقط. لا نسترجع ولا نعرض أي دليل أو نص يمسّ مسألة السائل نفسها
  //    (عرض حديث في مسألته يشبه الفتوى). التعريف العام المحايد في رد الإحالة الثابت نفسه.
  if (c.level === "D") {
    return done({ ...common, kind: "referral", text: withPrefix(message("referral", c.lang)), timings });
  }

  // 4) A / B / C: الاسترجاع.
  const t0 = Date.now();
  const found = await retrieve(c, question);
  timings.searchMs = Date.now() - t0;
  diag.retrieval = found.diag;
  const passages = found.passages;

  if (!passages.length) {
    diag.abstainReason = found.diag.counts.cleaned ? "no_relevant" : "no_passages";
    const text = withPrefix(`${message("abstain", c.lang)} ${message("suggestExpert", c.lang)}`);
    return done({ ...common, kind: "abstain", text, passages, timings });
  }

  // 5) الصياغة من النصوص فقط، ثم الحارس.
  const gen = await generate(question, c, c.level === "C" ? "khilaf" : "general", passages);
  timings.generateMs = gen.ms;
  base.costUsd += gen.cost;
  diag.attempts = gen.attempts;
  diag.abstainReason = gen.reason;
  const extra = { passages, guard: gen.guard, raw: gen.raw, timings };

  if (gen.reason === "guard") return done({ ...common, ...extra, kind: "refused", text: withPrefix(gen.text) });
  if (!gen.ok) {
    const text = withPrefix(`${message("abstain", c.lang)} ${message("suggestExpert", c.lang)}`);
    return done({ ...common, ...extra, kind: "abstain", text });
  }
  const body = c.level === "C" ? `${gen.text}\n\n${message("khilaf", c.lang)}` : gen.text;
  return done({ ...common, ...extra, kind: "answer", text: withPrefix(body) });
}

/** فحص نهائي لما يُعرض (للاختبار): صياغة الأداة كلها، مع النصوص المسترجعة. */
export function finalCheck(reply: BrainReply, question: string) {
  return checkOutput(reply.text, { sources: reply.passages.map((p) => p.text), question });
}
