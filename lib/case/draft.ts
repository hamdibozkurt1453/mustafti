import { allQuestionsByKey } from "./pillars";
import { redactText } from "./redact";
import { CASE_LIMITS, type CaseAnswer, type CaseDraft, type CasePlan, type CaseRow, type CaseUnknown } from "./types";

/**
 * بناء ملف المسألة بلا نموذج: جدول الأركان من الأجوبة، و«ما لم يُعرف»، والملخص الاحتياطي،
 * وحذف الهوية من كل حقل. النموذج (file.ts) يحسّن الملخص ويترجم القيم إلى العربية فقط.
 * الملف نقي ليُختبر: tests/case.test.ts.
 */

const QUESTIONS = allQuestionsByKey();

/** قيمة الخيار بالعربية من القالب («happened» ← «وقع فعلاً»)، أو null إن كانت نصاً حراً. */
export function arabicValue(key: string, value: string): string | null {
  const q = QUESTIONS.get(key);
  if (!q) return null;
  if (q.type === "yesno") return value === "yes" ? "نعم" : value === "no" ? "لا" : null;
  return q.options?.find((o) => o.value === value)?.ar ?? null;
}

/** صفوف جدول الأركان: ما ذكره السائل في سؤاله، ثم أجوبة الاستيضاح (بلا المتخطّى). */
export function rowsOf(plan: CasePlan, answers: CaseAnswer[]): CaseRow[] {
  const rows: CaseRow[] = plan.known.map((k) => ({
    key: k.key,
    labelAr: k.textAr,
    label: k.text,
    value: k.value,
    valueAr: (k.option && arabicValue(k.key, k.option)) || k.value,
    source: "question" as const,
  }));
  for (const q of plan.questions) {
    const a = answers.find((x) => x.key === q.key);
    if (!a || a.value === null || !a.value.trim()) continue;
    const raw = a.value.trim().slice(0, CASE_LIMITS.value);
    const option = q.options.find((o) => o.value === raw);
    const value = option?.label ?? raw;
    const valueAr = (option && !q.generated ? arabicValue(q.key, option.value) : null) ?? value;
    rows.push({
      key: q.key,
      labelAr: q.textAr,
      label: q.text,
      value,
      valueAr,
      source: "answer",
      ...(q.generated ? { generated: true } : {}),
    });
  }
  return rows;
}

/** «ما لم يُعرف»: كل سؤال تخطّاه السائل أو لم يُجب عنه. */
export function unknownsOf(plan: CasePlan, answers: CaseAnswer[]): CaseUnknown[] {
  return plan.questions
    .filter((q) => {
      const a = answers.find((x) => x.key === q.key);
      return !a || a.value === null || !a.value.trim();
    })
    .map((q) => ({ key: q.key, labelAr: q.textAr, label: q.text }));
}

/** ملخص بلا نموذج: سؤال السائل كما كتبه (والوقائع في جدول الأركان، فلا تتكرر). */
export function fallbackDraft(question: string, plan: CasePlan, answers: CaseAnswer[]): CaseDraft {
  const rows = rowsOf(plan, answers);
  const q = question.trim();
  const summaryAr = `يسأل السائل: «${q}»`;
  const summaryUser = plan.lang === "ar" ? summaryAr : `«${q}»`;
  return redactDraft({ question: q, summaryAr, summaryUser, rows, unknowns: unknownsOf(plan, answers) });
}

/** حذف الهوية بالأنماط من كل حقل نصي في الملف، مع حدود الطول. */
export function redactDraft(d: CaseDraft): CaseDraft {
  const r = (s: string, max: number) => redactText(String(s ?? "")).slice(0, max);
  return {
    question: r(d.question, CASE_LIMITS.question),
    summaryAr: r(d.summaryAr, CASE_LIMITS.summary),
    summaryUser: r(d.summaryUser, CASE_LIMITS.summary),
    rows: d.rows.slice(0, 24).map((row) => ({
      ...row,
      labelAr: r(row.labelAr, 300),
      label: r(row.label, 300),
      value: r(row.value, CASE_LIMITS.value),
      valueAr: r(row.valueAr, CASE_LIMITS.value),
    })),
    unknowns: d.unknowns.slice(0, 24).map((u) => ({ ...u, labelAr: r(u.labelAr, 300), label: r(u.label, 300) })),
  };
}
