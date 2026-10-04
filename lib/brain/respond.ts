import "server-only";

import { chat, type ChatMessage } from "@/lib/llm";
import { searchMany, type SourceId, type SourceResult } from "@/lib/sources";
import { classify, type Classification } from "./classify";
import { checkOutput, guardAndLog, matchKey, type GuardResult } from "./guard";
import { looksPersonal, looksUrgent } from "./heuristics";
import { detectIdentityProbe, guessLang, identityReply, type IdentityProbe } from "./identity";
import { message } from "./messages";
import { ABSTAIN_AR, answerSystem, answerUser, type AnswerMode, type Passage } from "./prompts";

/**
 * «عقل» مُستفتي من البداية إلى النهاية لرسالة واحدة:
 *   فحص الهوية بالكود ← التصنيف ← شبكة الأمان بالكود ← التوجيه:
 *   عاجل · خارج النطاق · هوية · D (معلومة عامة + إحالة) · A/B/C (استرجاع ← صياغة ← الحارس).
 *
 * يستعمله /api/admin/brain-test الآن، ومسار المحادثة في S5. لا يُعرض للسائل إلا text.
 */

/** المصادر الأساسية للاسترجاع: منصات الجمعية (MCP أولاً) وبيان الإسلام. مواقع الفتاوى خارجها
 * ما دامت ميزة «الفتوى السابقة المطابقة» متوقفة. */
export const CORE_SOURCES: SourceId[] = ["quranenc", "hadeethenc", "islamhouse", "byenah"];
const MAX_PASSAGES = 6;
const PASSAGE_CHARS = 900;

export type ReplyKind = "identity" | "urgent" | "out_of_scope" | "referral" | "answer" | "abstain" | "refused";

export type BrainReply = {
  kind: ReplyKind;
  /** ما يُعرض للسائل (صياغة الأداة بعد الحارس، أو رد ثابت). */
  text: string;
  lang: string;
  classification?: Classification;
  identityProbe: IdentityProbe | null;
  passages: Passage[];
  /** نتيجة الحارس على الصياغة المولّدة (إن وُجدت). */
  guard?: GuardResult;
  /** الصياغة الخام قبل الحارس (للمشرف فقط). */
  raw?: string;
  /** تجاوز الكود لقرار المصنّف (رفع المستوى أو العاجل). */
  overrides: string[];
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

/** البحث بالعربية وبلغة السائل، ثم إزالة المكرر وتوزيع النتائج على المصادر بالتناوب. */
export async function retrieve(c: Classification): Promise<Passage[]> {
  const queries = [
    ...c.searchQueries.ar.slice(0, 2).map((q) => ({ q, lang: "ar" })),
    ...c.searchQueries.userLang.slice(0, 1).map((q) => ({ q, lang: c.lang })),
  ];
  if (!queries.length) return [];
  const batches = await Promise.all(queries.map(({ q, lang }) => searchMany(CORE_SOURCES, q, lang).catch(() => [])));
  const seen = new Set<string>();
  const bySource = new Map<string, SourceResult[]>();
  for (const r of batches.flat()) {
    if (!r.text?.trim() || seen.has(r.url)) continue;
    seen.add(r.url);
    bySource.set(r.sourceId, [...(bySource.get(r.sourceId) ?? []), r]);
  }
  const picked: SourceResult[] = [];
  for (let round = 0; picked.length < MAX_PASSAGES; round++) {
    const before = picked.length;
    for (const list of bySource.values()) if (list[round] && picked.length < MAX_PASSAGES) picked.push(list[round]);
    if (picked.length === before) break;
  }
  return picked.map(toPassage);
}

function isAbstention(text: string, lang: string): boolean {
  const key = matchKey(text);
  return key.includes(matchKey(ABSTAIN_AR)) || key.includes(matchKey(message("abstain", lang)));
}

/** كل ادعاء يجب أن يشير إلى نص مسترجع: [n] واحد على الأقل، وكل [n] ضمن عدد النصوص. */
function citationsValid(text: string, count: number): boolean {
  const refs = [...text.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1]));
  return refs.length > 0 && refs.every((n) => n >= 1 && n <= count);
}

type Generated = { text: string; raw: string; guard: GuardResult; ok: boolean; abstained: boolean; ms: number; cost: number };

async function generate(question: string, c: Classification, mode: AnswerMode, passages: Passage[]): Promise<Generated> {
  const input = { question, lang: c.lang, mode, passages, misconception: c.misconception, userType: c.userType };
  const messages: ChatMessage[] = [
    { role: "system", content: answerSystem(input) },
    { role: "user", content: answerUser(input) },
  ];
  const res = await chat(messages, { temperature: 0.1, maxTokens: 900 });
  const raw = res.text.trim();
  const guard = await guardAndLog(raw, { sources: passages.map((p) => p.text), question, lang: c.lang });
  const abstained = guard.ok && isAbstention(raw, c.lang);
  // جواب بلا إحالة إلى نص مسترجع = قد يكون من ذاكرة النموذج ⇒ امتناع.
  const ok = guard.ok && !abstained && citationsValid(raw, passages.length);
  return { text: guard.text, raw, guard, ok, abstained, ms: res.latencyMs, cost: res.usage.costUsd ?? 0 };
}

export async function respond(question: string, options: { history?: ChatMessage[] } = {}): Promise<BrainReply> {
  const started = Date.now();
  const overrides: string[] = [];
  const probe = detectIdentityProbe(question);
  const base = { identityProbe: probe, passages: [] as Passage[], overrides, costUsd: 0 };
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

  // 3) الاسترجاع.
  const t0 = Date.now();
  const passages = await retrieve(c);
  timings.searchMs = Date.now() - t0;

  // 4) D: معلومة عامة من النصوص (إن وُجدت وسلمت من الحارس) + الإحالة الثابتة.
  if (c.level === "D") {
    let general = "";
    let gen: Generated | undefined;
    if (passages.length) {
      gen = await generate(question, c, "personal_general", passages);
      timings.generateMs = gen.ms;
      base.costUsd += gen.cost;
      if (gen.ok) general = gen.text;
    }
    const text = withPrefix([general, message("referral", c.lang)].filter(Boolean).join("\n\n"));
    return done({ ...common, kind: "referral", text, passages, guard: gen?.guard, raw: gen?.raw, timings });
  }

  // 5) A / B / C.
  if (!passages.length) {
    const text = withPrefix(`${message("abstain", c.lang)} ${message("suggestExpert", c.lang)}`);
    return done({ ...common, kind: "abstain", text, passages, timings });
  }
  const gen = await generate(question, c, c.level === "C" ? "khilaf" : "general", passages);
  timings.generateMs = gen.ms;
  base.costUsd += gen.cost;
  const extra = { passages, guard: gen.guard, raw: gen.raw, timings };

  if (!gen.guard.ok) return done({ ...common, ...extra, kind: "refused", text: withPrefix(gen.text) });
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
