import "server-only";

import { chat, type ChatMessage } from "@/lib/llm";
import { search, type SourceId, type SourceResult } from "@/lib/sources";
import { classify, type Classification } from "./classify";
import { checkOutput, guardAndLog, matchKey, type GuardResult } from "./guard";
import { findTerms } from "./glossary";
import { looksPersonal, looksUrgent } from "./heuristics";
import { detectIdentityProbe, guessLang, identityReply, type IdentityProbe } from "./identity";
import { message } from "./messages";
import { ABSTAIN_AR, answerSystem, answerUser, type AnswerMode, type Passage } from "./prompts";

/**
 * «عقل» مُستفتي من البداية إلى النهاية لرسالة واحدة:
 *   فحص الهوية بالكود ← التصنيف ← شبكة الأمان بالكود ← التوجيه:
 *   عاجل · خارج النطاق · هوية · D (إحالة فقط) · A/B/C (استرجاع ← صياغة ← الحارس).
 *
 * يستعمله /api/admin/brain-test الآن، ومسار المحادثة في S5. لا يُعرض للسائل إلا text،
 * و diag للمشرف فقط (لتشخيص الامتناع: هل البحث فارغ، أم امتنع النموذج، أم رُفضت الصياغة).
 */

/**
 * مصادر الاسترجاع: منصات الجمعية عبر MCP (القرآن، والحديث، وIslamHouse)، وبيان الإسلام،
 * ورسالة الحرمين، والإسلام سؤال وجواب (للشرح العام فقط؛ الحالة الشخصية لا تُسترجع لها نصوص).
 */
export const CORE_SOURCES: SourceId[] = ["islamhouse", "hadeethenc", "quranenc", "byenah", "risala", "islamqa"];
const MAX_PASSAGES = 6;
const PASSAGE_CHARS = 900;
/** مهلة كل مصدر في المحادثة (أطول قليلاً من مهلة /api/health). */
const SEARCH_DEADLINE_MS = 8_000;
/** إن لم يصل شيء: انتظار قصير ثم إعادة البحث نفسه، فتجد الطلبات التي اكتملت في الخلفية في الذاكرة. */
const RETRY_WAIT_MS = 2_500;

export type ReplyKind = "identity" | "urgent" | "out_of_scope" | "referral" | "answer" | "abstain" | "refused";

/** سبب الامتناع (للتشخيص). */
export type AbstainReason = "no_passages" | "model_abstained" | "no_citation" | "guard";

export type SearchDiag = { query: string; lang: string; source: SourceId; results: number; ms: number };

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
    queries: { q: string; lang: string }[];
    searches: SearchDiag[];
    retried: boolean;
    abstainReason?: AbstainReason;
    /** محاولات الصياغة (الثانية بعد اعتراض الحارس). */
    attempts: { raw: string; guardOk: boolean; findings: string[] }[];
  };
  timings: { classifyMs?: number; searchMs?: number; generateMs?: number; totalMs: number };
  costUsd: number;
};

function toPassage(r: SourceResult): Passage {
  return {
    title: r.title,
    text: r.text.length > PASSAGE_CHARS ? `${r.text.slice(0, PASSAGE_CHARS)}…` : r.text,
    url: r.url,
    source: r.source,
    grade: r.grade,
    lang: r.lang,
  };
}

/** كلمات السؤال المفيدة للبحث (بلا أدوات الاستفهام). */
const STOP =
  /^(ما|ماذا|لماذا|هل|كيف|من|متى|أين|اين|معنى|هي|هو|في|عن|على|إلى|الى|أن|ان|لا|او|أو|هذا|هذه|ذلك|التي|الذي|كل|بين|مع|لم|لن|قد|يا|the|a|an|is|are|do|does|did|what|why|how|who|in|of|to|and|or|it|its|isn't|just|for|on|with|apa|saja|dalam|yang|dan|ne|nedir|kimlere|mi|mı|le|la|les|des|un|une|est|ce|que|qui|کے|کی|کا|کیا|ہیں|ہے)$/i;

/** للمطابقة (موحّدة). */
function keywords(text: string): string[] {
  return matchKey(text)
    .split(" ")
    .filter((w) => w.length > 2 && !STOP.test(w));
}

/** للبحث (بالحروف الأصلية، فلا تتحول التاء المربوطة إلى هاء). */
function queryWords(text: string): string[] {
  return text.split(/[^\p{L}\p{N}\p{M}]+/u).filter((w) => w.length > 2 && !STOP.test(w) && !STOP.test(matchKey(w)));
}

/**
 * كلمات البحث: ما اقترحه المصنّف بالعربية وبلغة السائل، ثم احتياط بالكود:
 * مصطلحات القاموس الواردة، وسؤال السائل نفسه مختصراً.
 */
export function buildQueries(c: Classification, question: string): { q: string; lang: string }[] {
  const out: { q: string; lang: string }[] = [];
  const add = (q: string, lang: string) => {
    const t = q.trim().slice(0, 120);
    if (t && !out.some((x) => x.q === t && x.lang === lang)) out.push({ q: t, lang });
  };
  c.searchQueries.ar.slice(0, 3).forEach((q) => add(q, "ar"));
  if (c.lang !== "ar") c.searchQueries.userLang.slice(0, 2).forEach((q) => add(q, c.lang));
  for (const t of findTerms(question).slice(0, 2)) add(t.term_ar, "ar");
  const kw = queryWords(question).slice(0, 6).join(" ");
  if (kw) add(kw, c.lang);
  return out.slice(0, 5);
}

/** درجة صلة بسيطة: كلمات البحث والسؤال الموجودة في عنوان النص ومقتطفه. */
function relevance(r: SourceResult, terms: string[]): number {
  const hay = matchKey(`${r.title} ${r.text}`);
  return terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
}

async function searchAll(queries: { q: string; lang: string }[], diag: SearchDiag[]): Promise<SourceResult[]> {
  const jobs = queries.flatMap(({ q, lang }) =>
    CORE_SOURCES.map(async (source) => {
      const t0 = Date.now();
      const results = await search(source, q, lang, SEARCH_DEADLINE_MS).catch(() => []);
      diag.push({ query: q, lang, source, results: results.length, ms: Date.now() - t0 });
      return results;
    }),
  );
  return (await Promise.all(jobs)).flat();
}

/** البحث بالعربية وبلغة السائل في كل المصادر، ثم إزالة المكرر، وترتيب بالصلة مع تنويع المصادر. */
export async function retrieve(
  c: Classification,
  question: string,
): Promise<{ passages: Passage[]; queries: { q: string; lang: string }[]; searches: SearchDiag[]; retried: boolean }> {
  const queries = buildQueries(c, question);
  const searches: SearchDiag[] = [];
  if (!queries.length) return { passages: [], queries, searches, retried: false };

  let results = await searchAll(queries, searches);
  let retried = false;
  if (!results.length) {
    retried = true;
    await new Promise((r) => setTimeout(r, RETRY_WAIT_MS));
    results = await searchAll(queries, searches);
  }

  const terms = [...new Set(queries.flatMap((q) => keywords(q.q)).concat(keywords(question)))];
  const seen = new Set<string>();
  const unique = results.filter((r) => {
    if (!r.text?.trim() || seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
  const scored = unique.map((r) => ({ r, s: relevance(r, terms) })).sort((a, b) => b.s - a.s);
  // تنويع: لا يزيد مصدر واحد على 3 نصوص.
  const perSource = new Map<string, number>();
  const picked: SourceResult[] = [];
  for (const { r } of scored) {
    if (picked.length >= MAX_PASSAGES) break;
    const n = perSource.get(r.sourceId) ?? 0;
    if (n >= 3) continue;
    perSource.set(r.sourceId, n + 1);
    picked.push(r);
  }
  return { passages: picked.map(toPassage), queries, searches, retried };
}

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
  const diag: BrainReply["diag"] = { queries: [], searches: [], retried: false, attempts: [] };
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
  Object.assign(diag, { queries: found.queries, searches: found.searches, retried: found.retried });
  const passages = found.passages;

  if (!passages.length) {
    diag.abstainReason = "no_passages";
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
