import "server-only";

import { z } from "zod";
import { chatJson, chatStream, LlmError, type ChatMessage } from "@/lib/llm";

/**
 * اختبار المقارنة بين النماذج المرشحة (الخطة 0.4) على 10 أسئلة بخمس لغات.
 *
 * المهمة المختبرة هي مهمة مُستفتي الفعلية الأولى: **فهم السؤال وتصنيفه** وإعادة صياغته
 * بالعربية واقتراح كلمات بحث، بإخراج JSON مضبوط. لا يُطلب من النموذج أي جواب شرعي،
 * التزاماً بالقاعدة الأولى (النموذج لا يُفتي ولا يجيب من ذاكرته).
 *
 * المعايير: فهم السؤال (اللغة والمستوى والحالة الشخصية)، وجودة العربية (فحص آلي +
 * عينات للمراجعة البشرية)، والالتزام بـ JSON، والسرعة (زمن أول كلمة وزمن الجواب)، والتكلفة.
 */

export const CANDIDATE_MODELS = [
  { id: "qwen/qwen3.8-omni-flash", role: "الأساسي (المرشح الأول)" },
  { id: "google/gemini-3.8-flash", role: "الأقوى (للمقارنة)" },
  { id: "xiaomi/mimo-v2.6-flash", role: "بديل رخيص" },
] as const;

type Level = "A" | "B" | "C" | "D";

type Question = { lang: "ar" | "en" | "tr" | "fr" | "ur"; text: string; levels: Level[]; personal: boolean };

/** الأسئلة العشرة: سؤال عام وحالة شخصية لكل لغة. المستوى المتوقع حسب المرجعية (ص 2). */
export const QUESTIONS: Question[] = [
  { lang: "ar", text: "ما معنى التوحيد لشخص لم يسمع بالمصطلح من قبل؟", levels: ["A", "B"], personal: false },
  { lang: "ar", text: "طلقت زوجتي وأنا غاضب جداً، هل وقع الطلاق؟", levels: ["D"], personal: true },
  { lang: "en", text: "Why do Muslims worship the Kaaba?", levels: ["A", "B"], personal: false },
  { lang: "en", text: "I live in Germany. Am I allowed to take a bank mortgage to buy my family's house?", levels: ["D"], personal: true },
  { lang: "tr", text: "Ramazan orucu kimlere farzdır?", levels: ["A", "B"], personal: false },
  { lang: "tr", text: "Babam vefat etti, mirası üç kız kardeş ve bir erkek kardeş olarak nasıl paylaşmalıyız?", levels: ["D"], personal: true },
  { lang: "fr", text: "Le Coran a-t-il été écrit par Muhammad ?", levels: ["B"], personal: false },
  { lang: "fr", text: "Pourquoi les savants musulmans ont-ils des avis différents sur certaines questions ?", levels: ["B", "C"], personal: false },
  { lang: "ur", text: "نماز کے ارکان کیا ہیں؟", levels: ["A", "B"], personal: false },
  { lang: "ur", text: "میں نے عصر کی نماز میں ایک رکعت بھول کر چھوڑ دی، کیا میری نماز ہو گئی؟", levels: ["D"], personal: true },
];

export const AnalysisSchema = z.object({
  detected_lang: z.string().describe("ISO 639-1 code of the question language"),
  question_ar: z.string().describe("Faithful, fluent Modern Standard Arabic rendering of the question"),
  topic_ar: z.string().describe("Short topic label in Arabic"),
  level: z.enum(["A", "B", "C", "D"]),
  is_personal_case: z.boolean(),
  search_queries_ar: z.array(z.string()).min(1).max(4),
});

const SYSTEM = `You analyse questions sent to an Islamic Q&A tool. You never answer them and never give any religious ruling.
Content levels (from the official reference):
A = settled foundational information (Quran, authentic hadith, pillars of Islam and faith, basic seerah, values).
B = explanation, definitions, comparisons, objectives of the law, general intellectual questions and common doubts.
C = juristic disagreement, detailed creed issues, controversial history, questions needing specialised scholarly research.
D = a ruling on an individual's own situation: validity of a specific person's contract or worship, family disputes, legal or medical matters with religious effect.
is_personal_case is true when the asker wants a ruling on their own concrete situation.
question_ar must be a faithful, natural Modern Standard Arabic rendering of the question (no answer, no comment).
search_queries_ar: 1-4 short Arabic search phrases to look the topic up in approved sources.
Reply with JSON only.`;

export type QuestionResult = {
  index: number;
  lang: string;
  ok: boolean;
  latencyMs: number;
  costUsd: number | null;
  jsonMode: "strict" | "repaired" | "fallback" | "failed";
  langCorrect: boolean;
  levelCorrect: boolean;
  personalCorrect: boolean;
  arabicScore: number;
  output?: z.infer<typeof AnalysisSchema>;
  error?: string;
};

export type ModelReport = {
  model: string;
  role: string;
  firstTokenMs: number | null;
  questions: QuestionResult[];
  summary: {
    understanding: number;
    arabic: number;
    jsonStrict: number;
    jsonValid: number;
    medianLatencyMs: number;
    totalCostUsd: number | null;
    failures: number;
  };
};

/** فحص آلي لجودة العربية: نسبة الحروف العربية، وغياب اللاتينية والأخطاء الشائعة، وطول معقول. */
export function arabicQuality(text: string): number {
  const letters = text.replace(/[\s\d\p{P}\p{S}]/gu, "");
  if (!letters.length) return 0;
  const arabic = (letters.match(/[؀-ۿ]/g) ?? []).length / letters.length;
  const latin = (letters.match(/[A-Za-z]/g) ?? []).length / letters.length;
  // حروف أردية/فارسية ليست من العربية الفصحى (ٹ ڈ ڑ ں ے ہ ھ گ پ چ ژ ک ی).
  const nonArabic = /[ٹڈڑںےہھگپچژکی]/.test(text) ? 0.25 : 0;
  const length = text.length >= 8 && text.length <= 400 ? 0 : 0.2;
  return Math.max(0, Math.min(1, arabic - latin - nonArabic - length));
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

async function firstTokenLatency(model: string): Promise<number | null> {
  const started = Date.now();
  try {
    const stream = chatStream([{ role: "user", content: "اكتب كلمة: مرحباً" }], { model, maxTokens: 20, retries: 0 });
    for await (const piece of stream) {
      if (piece) {
        const ms = Date.now() - started;
        await stream.return({ usage: { promptTokens: 0, completionTokens: 0, costUsd: null }, latencyMs: ms });
        return ms;
      }
    }
  } catch {
    /* يُسجَّل null */
  }
  return null;
}

async function runQuestion(model: string, q: Question, index: number): Promise<QuestionResult> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: q.text },
  ];
  const base = { index, lang: q.lang, langCorrect: false, levelCorrect: false, personalCorrect: false, arabicScore: 0 };
  try {
    const res = await chatJson(messages, AnalysisSchema, { model, schemaName: "question_analysis", timeoutMs: 45_000, retries: 1 });
    const out = res.data;
    return {
      ...base,
      ok: true,
      latencyMs: res.latencyMs,
      costUsd: res.usage.costUsd,
      jsonMode: res.mode,
      langCorrect: out.detected_lang.toLowerCase().startsWith(q.lang),
      levelCorrect: q.levels.includes(out.level),
      personalCorrect: out.is_personal_case === q.personal,
      arabicScore: arabicQuality(out.question_ar),
      output: out,
    };
  } catch (error) {
    const detail = error instanceof LlmError ? `${error.code}${error.status ? ` ${error.status}` : ""}: ${error.detail}` : String(error);
    return { ...base, ok: false, latencyMs: 0, costUsd: null, jsonMode: "failed", error: detail.slice(0, 200) };
  }
}

export async function runModel(model: string, role: string): Promise<ModelReport> {
  const firstTokenMs = await firstTokenLatency(model);
  const questions: QuestionResult[] = [];
  for (let i = 0; i < QUESTIONS.length; i++) questions.push(await runQuestion(model, QUESTIONS[i], i + 1));

  const ok = questions.filter((r) => r.ok);
  const costs = ok.map((r) => r.costUsd).filter((c): c is number => c !== null);
  const pct = (n: number) => Math.round((n / QUESTIONS.length) * 100);
  return {
    model,
    role,
    firstTokenMs,
    questions,
    summary: {
      understanding: pct(ok.reduce((s, r) => s + (Number(r.langCorrect) + Number(r.levelCorrect) + Number(r.personalCorrect)) / 3, 0)),
      arabic: pct(ok.reduce((s, r) => s + r.arabicScore, 0)),
      jsonStrict: pct(ok.filter((r) => r.jsonMode === "strict").length),
      jsonValid: pct(ok.length),
      medianLatencyMs: median(ok.map((r) => r.latencyMs)),
      totalCostUsd: costs.length ? Number(costs.reduce((a, b) => a + b, 0).toFixed(6)) : null,
      failures: QUESTIONS.length - ok.length,
    },
  };
}

/** يشغّل الاختبار على النماذج الثلاثة بالتوازي (كل نموذج يمر على الأسئلة بالتتابع). */
export async function runModelTest(models = CANDIDATE_MODELS.map((m) => ({ id: m.id as string, role: m.role as string }))) {
  const reports = await Promise.all(models.map((m) => runModel(m.id, m.role)));
  return { ranAt: new Date().toISOString(), reports, recommendation: recommend(reports) };
}

/**
 * التوصية حسب قاعدة الخطة 0.4: الأفضل جودة في العربية والفهم، فإن تقاربت الجودة
 * (فرق 5 نقاط أو أقل) يُعتمد الأرخص. نموذج لا يلتزم بـ JSON في 9 من 10 على الأقل يُستبعد.
 */
export function recommend(reports: ModelReport[]): { model: string | null; reason: string } {
  const eligible = reports.filter((r) => r.summary.jsonValid >= 90);
  if (!eligible.length) return { model: null, reason: "لا نموذج التزم بإخراج JSON في 9 أسئلة من 10 على الأقل." };
  const quality = (r: ModelReport) => (r.summary.understanding + r.summary.arabic) / 2;
  const best = Math.max(...eligible.map(quality));
  const close = eligible.filter((r) => best - quality(r) <= 5);
  const cost = (r: ModelReport) => r.summary.totalCostUsd ?? Number.POSITIVE_INFINITY;
  const pick = close.sort((a, b) => cost(a) - cost(b) || a.summary.medianLatencyMs - b.summary.medianLatencyMs)[0];
  return {
    model: pick.model,
    reason:
      close.length > 1
        ? `جودته (${quality(pick).toFixed(0)}) قريبة من الأفضل (${best.toFixed(0)}) وهو الأرخص بينها، فيُعتمد حسب قاعدة الخطة 0.4.`
        : `الأعلى جودة في الفهم والعربية (${quality(pick).toFixed(0)}) بفارق واضح.`,
  };
}

/** تقرير Markdown جاهز للصق في docs/decisions.md. */
export function toMarkdown(result: Awaited<ReturnType<typeof runModelTest>>): string {
  const date = new Date(result.ranAt).toISOString().slice(0, 16).replace("T", " ");
  const rows = result.reports
    .map((r) => {
      const s = r.summary;
      return `| \`${r.model}\` | ${r.role} | ${s.understanding}% | ${s.arabic}% | ${s.jsonValid}% (صارم ${s.jsonStrict}%) | ${r.firstTokenMs ?? "—"} / ${s.medianLatencyMs} | ${s.totalCostUsd === null ? "—" : `$${s.totalCostUsd.toFixed(4)}`} | ${s.failures} |`;
    })
    .join("\n");

  const samples = QUESTIONS.map((q, i) => {
    const lines = result.reports
      .map((r) => {
        const out = r.questions[i]?.output;
        return `  - \`${r.model.split("/")[1]}\`: ${out ? `${out.level}${out.is_personal_case ? "، شخصية" : ""} — ${out.question_ar}` : `فشل (${r.questions[i]?.error ?? "?"})`}`;
      })
      .join("\n");
    return `${i + 1}. (${q.lang}، متوقع ${q.levels.join("/")}${q.personal ? "، شخصية" : ""}) ${q.text}\n${lines}`;
  }).join("\n");

  return `### نتيجة اختبار النماذج (${date} UTC)

| النموذج | الدور | فهم السؤال | جودة العربية (آلي) | الالتزام بـ JSON | أول كلمة / الجواب (ms) | تكلفة 10 أسئلة | إخفاقات |
|---|---|---|---|---|---|---|---|
${rows}

**التوصية:** ${result.recommendation.model ? `\`${result.recommendation.model}\` — ${result.recommendation.reason}` : result.recommendation.reason}

<details><summary>صياغة كل نموذج للأسئلة بالعربية (للمراجعة البشرية لجودة العربية)</summary>

${samples}

</details>
`;
}
