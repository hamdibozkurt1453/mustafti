import type { CaseAnswer, CasePlan, PlanQuestion, ShowIf } from "./types";

/**
 * تسلسل الاستيضاح (في المتصفح والخادم والاختبارات).
 *   - showIf: سؤال لا يناسب النوع الفرعي لا يُعرض («كيف تُحسب الزيادة» ليس لراتب الموظف).
 *   - hideIf: سؤال يُغني عنه ركن معروف لا يُعرض («الحال والنية» بعد معرفة سبب الفوات).
 *   - 8 أسئلة كحد أقصى، صارماً في الخطة نفسها (capPlan: لا يتجاوز أي مسار 8)، وفي العرض.
 * values: قيم الخيارات المعروفة؛ وجود المفتاح (ولو بلا قيمة) يعني أن الركن معروف.
 * الجواب الحر أو المتخطّى يعني «قيمة غير معروفة»، فيبقى السؤال المشروط ظاهراً احتياطاً.
 * ملف نقي بلا قوالب، فيُستورد في الواجهة.
 */

export const MAX_ASKED = 8;

type Conditional = { key: string; required: boolean; showIf?: ShowIf; hideIf?: string[]; options?: { value: string }[] };

export type Values = Record<string, string | undefined>;

/** هل يُعرض السؤال بحسب الأركان المعروفة؟ */
export function shown(q: { showIf?: ShowIf; hideIf?: string[] }, values: Values): boolean {
  if (q.hideIf?.some((k) => k in values)) return false;
  const c = q.showIf;
  if (!c) return true;
  const v = values[c.key];
  if (v === undefined) return true;
  if (c.in && !c.in.includes(v)) return false;
  if (c.notIn && c.notIn.includes(v)) return false;
  return true;
}

/** الأسئلة الفعلية: ما يناسب الشروط، ثم الإلزامي أولاً حتى max، بترتيبها. */
export function activeQuestions<T extends Conditional>(questions: T[], values: Values, max = MAX_ASKED): T[] {
  const pool = questions.filter((q) => shown(q, values));
  const chosen = new Set<string>();
  for (const q of pool) if (q.required && chosen.size < max) chosen.add(q.key);
  for (const q of pool) if (!q.required && chosen.size < max) chosen.add(q.key);
  return pool.filter((q) => chosen.has(q.key));
}

/** أكبر عدد أسئلة قد يُعرض في أي مسار (كل قيم الأسئلة التي تُبنى عليها الشروط). */
export function worstCase<T extends Conditional>(selected: T[], pool: T[]): number {
  const keys = [...new Set(selected.map((q) => q.showIf?.key).filter((k): k is string => Boolean(k)))];
  const choices = keys.map((k) => [undefined, ...(pool.find((q) => q.key === k)?.options ?? []).map((o) => o.value)]);
  let worst = 0;
  const combo: Values = {};
  let budget = 2000;
  const walk = (i: number) => {
    if (budget-- <= 0) return;
    if (i === keys.length) {
      // hideIf لا يُحسب هنا: أسوأ حال أن يُعرض السؤال.
      worst = Math.max(worst, selected.filter((q) => shown({ showIf: q.showIf }, combo)).length);
      return;
    }
    for (const v of choices[i]) {
      if (v === undefined) delete combo[keys[i]];
      else combo[keys[i]] = v;
      walk(i + 1);
    }
    delete combo[keys[i]];
  };
  walk(0);
  return worst;
}

/** حد الخطة الصارم: بالترتيب المعطى (الأولوية)، يُضاف السؤال ما دام أي مسار لا يتجاوز max. */
export function capPlan<T extends Conditional>(ordered: T[], max = MAX_ASKED): T[] {
  const out: T[] = [];
  for (const q of ordered) if (worstCase([...out, q], ordered) <= max) out.push(q);
  return out;
}

/** الأركان المعروفة: من نص السؤال (known) ومن الأجوبة (قيمة الخيار، أو بلا قيمة للجواب الحر). */
export function conditionValues(plan: CasePlan, answers: CaseAnswer[]): Values {
  const values: Values = {};
  for (const k of plan.known) values[k.key] = k.option;
  for (const a of answers) {
    if (a.value === null) continue;
    const q = plan.questions.find((x) => x.key === a.key);
    values[a.key] = q?.options.some((o) => o.value === a.value) ? a.value : undefined;
  }
  return values;
}

/** السؤال التالي ورقمه وعدد الأسئلة الفعلية الآن، أو null إن انتهت. */
export function nextQuestion(plan: CasePlan, answers: CaseAnswer[]): { question: PlanQuestion; n: number; total: number } | null {
  const answered = new Set(answers.map((a) => a.key));
  // الخطة محدودة سلفاً (capPlan)، فالحد هنا لا يقطع شيئاً؛ والعدد = ما أُجيب + ما بقي ظاهراً.
  const active = activeQuestions(plan.questions, conditionValues(plan, answers));
  const question = active.find((q) => !answered.has(q.key));
  if (!question) return null;
  const done = answers.length;
  const remaining = active.filter((q) => !answered.has(q.key)).length;
  return { question, n: done + 1, total: Math.min(MAX_ASKED, done + remaining) };
}

/** الأسئلة الفعلية بعد انتهاء الاستيضاح (لـ«ما لم يُعرف»). */
export function askedQuestions(plan: CasePlan, answers: CaseAnswer[]): PlanQuestion[] {
  return activeQuestions(plan.questions, conditionValues(plan, answers));
}
