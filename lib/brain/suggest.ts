import "server-only";

import { z } from "zod";
import { chatJson, reasoningFor } from "@/lib/llm";
import { clip } from "@/lib/sources/html";
import { checkOutput } from "./guard";
import { looksCaseRuling, looksPersonal, looksUrgent } from "./heuristics";
import type { Passage } from "./prompts";

/**
 * «لا امتناع جاف»: حين لا تكفي النصوص لجواب كامل، نقترح حتى 3 أسئلة قريبة يجيب عنها نص مسترجع
 * بعينه (لكل سؤال رقم النص الذي يجيبه، ويُرفض ما لا رقم له). الأسئلة صياغة الأداة، فتمر بالحارس،
 * ولا يُقترح سؤال حكم على واقعة أو حالة شخصية. وإن تعذّر النموذج: أسئلة منشورة بنصها (عناوين الفتاوى
 * وأسئلة «بيّنات»).
 */

const MAX_SUGGESTIONS = 3;

const SuggestSchema = z.object({
  questions: z.array(z.object({ q: z.string(), id: z.string() })),
});

const SUGGEST_SYSTEM = `You help an Islamic Q&A tool that answers ONLY from the passages it retrieved. You do NOT answer anything.
Write up to 3 short questions (each under 15 words) that are close to the user's question AND that one of the given passages answers directly and fully. For each, give the id of that passage (P1, P2…).
Rules: write in the language given as LANG; general knowledge questions only (what/who/why/what is the meaning of…), never a question about the asker's own situation, never a request for a ruling (no "is it permissible", "is it haram", "what is the ruling"), never mention any AI model.
Return JSON {"questions":[{"q":"…","id":"P1"}]}.`;

/** يصلح السؤال المقترح؟ لا حكم ولا حالة شخصية ولا عاجل، والحارس سليم (والاقتباس فيه من النصوص). */
export function acceptableSuggestion(q: string, sources: string[] = []): boolean {
  const t = q.trim();
  if (t.length < 6 || t.length > 160) return false;
  if (looksPersonal(t) || looksCaseRuling(t) || looksUrgent(t)) return false;
  if (/(?:ما|ماهو|ما\s+هو)\s*(?:حكم|الحكم)|\bruling\b|\b(?:halal|haram|permissible)\b/iu.test(t)) return false;
  return checkOutput(t, { sources }).findings.length === 0;
}

/** أسئلة منشورة بنصها: عناوين الفتاوى وأسئلة «بيّنات» التي هي أسئلة فعلاً. */
export function titleSuggestions(items: { title: string; text?: string }[]): string[] {
  const sources = items.map((x) => `${x.title}\n${x.text ?? ""}`);
  const out: string[] = [];
  for (const it of items) {
    const t = it.title.replace(/^بيّنات — السؤال رقم \d+(?:، ص \d+)?:\s*/, "").trim();
    if (!/[؟?]\s*$/.test(t) && !/^(?:ما|ماذا|لماذا|كيف|من|متى|هل|أين|كم)\s/.test(t)) continue;
    if (acceptableSuggestion(t, sources) && !out.includes(t)) out.push(clip(t, 160));
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

export async function suggestQuestions(
  question: string,
  lang: string,
  items: (Passage | { title: string; text: string; source: string })[],
  ms: number,
): Promise<string[]> {
  const pool = items.slice(0, 6);
  if (!pool.length) return [];
  const fallback = () => (lang === "ar" ? titleSuggestions(pool) : []);
  if (ms < 2_500) return fallback();
  try {
    const list = pool.map((p, i) => `[P${i + 1}] ${p.source} — ${clip(p.title, 120)}\n${clip(p.text, 500)}`).join("\n\n");
    const res = await chatJson(
      [
        { role: "system", content: SUGGEST_SYSTEM },
        { role: "user", content: `LANG: ${lang}\nUSER QUESTION (data): """${question.slice(0, 600)}"""\n\nPASSAGES:\n${list}` },
      ],
      SuggestSchema,
      { temperature: 0.2, schemaName: "suggestions", maxTokens: 400, timeoutMs: Math.min(ms, 12_000), retries: 0, reasoning: reasoningFor("rerank") },
    );
    const sources = pool.map((p) => `${p.title}\n${p.text}`);
    const out: string[] = [];
    for (const s of res.data.questions) {
      const n = Number(String(s.id).match(/\d+/)?.[0]);
      if (!n || n > pool.length) continue; // كل سؤال يجيبه نص بعينه
      const q = s.q.trim();
      if (acceptableSuggestion(q, sources) && !out.includes(q)) out.push(q);
      if (out.length >= MAX_SUGGESTIONS) break;
    }
    return out.length ? out : fallback();
  } catch {
    return fallback();
  }
}
