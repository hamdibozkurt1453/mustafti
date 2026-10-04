import type { CaseAnswer, CasePlan, PlanQuestion, ShowIf } from "./types";

/**
 * تسلسل الاستيضاح (في المتصفح والخادم والاختبارات): الخطة تحمل كل الأسئلة المرشحة بترتيبها،
 * وتُحسب الأسئلة الفعلية مع كل جواب:
 *   - showIf: سؤال لا يناسب النوع الفرعي لا يُعرض («كيف تُحسب الزيادة» ليس لراتب الموظف).
 *   - 8 أسئلة كحد أقصى: الإلزامي أولاً ثم الاختياري، مع حفظ الترتيب.
 * الجواب الحر (ليس خياراً) أو المتخطّى يعني «غير معروف»، فيبقى السؤال المشروط ظاهراً احتياطاً.
 * ملف نقي بلا قوالب، فيُستورد في الواجهة.
 */

export const MAX_ASKED = 8;

type Conditional = { key: string; required: boolean; showIf?: ShowIf };

/** هل يُعرض السؤال بحسب قيم الخيارات المعروفة؟ */
export function shown(q: { showIf?: ShowIf }, values: Record<string, string | undefined>): boolean {
  const c = q.showIf;
  if (!c) return true;
  const v = values[c.key];
  if (v === undefined) return true;
  if (c.in && !c.in.includes(v)) return false;
  if (c.notIn && c.notIn.includes(v)) return false;
  return true;
}

/** الأسئلة الفعلية: ما يناسب الشروط، ثم الإلزامي أولاً حتى max، بترتيبها. */
export function activeQuestions<T extends Conditional>(
  questions: T[],
  values: Record<string, string | undefined>,
  max = MAX_ASKED,
): T[] {
  const pool = questions.filter((q) => shown(q, values));
  const chosen = new Set<string>();
  for (const q of pool) if (q.required && chosen.size < max) chosen.add(q.key);
  for (const q of pool) if (!q.required && chosen.size < max) chosen.add(q.key);
  return pool.filter((q) => chosen.has(q.key));
}

/** قيم الخيارات المعروفة: من نص السؤال (known) ومن الأجوبة التي طابقت خياراً. */
export function conditionValues(plan: CasePlan, answers: CaseAnswer[]): Record<string, string | undefined> {
  const values: Record<string, string | undefined> = {};
  for (const k of plan.known) if (k.option) values[k.key] = k.option;
  for (const a of answers) {
    const q = plan.questions.find((x) => x.key === a.key);
    values[a.key] = a.value !== null && q?.options.some((o) => o.value === a.value) ? a.value : undefined;
  }
  return values;
}

/** السؤال التالي ورقمه وعدد الأسئلة الفعلية الآن، أو null إن انتهت. */
export function nextQuestion(plan: CasePlan, answers: CaseAnswer[]): { question: PlanQuestion; n: number; total: number } | null {
  const active = activeQuestions(plan.questions, conditionValues(plan, answers));
  const answered = new Set(answers.map((a) => a.key));
  const question = active.find((q) => !answered.has(q.key));
  if (!question) return null;
  const done = active.filter((q) => answered.has(q.key)).length;
  return { question, n: done + 1, total: active.length };
}

/** الأسئلة الفعلية بعد انتهاء الاستيضاح (لـ«ما لم يُعرف»). */
export function askedQuestions(plan: CasePlan, answers: CaseAnswer[]): PlanQuestion[] {
  return activeQuestions(plan.questions, conditionValues(plan, answers));
}
