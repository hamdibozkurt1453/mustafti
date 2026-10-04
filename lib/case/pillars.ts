import pillars from "@/content/pillars.json";
import { CHAPTERS } from "@/lib/brain/prompts";
import type { AnswerType, Chapter } from "./types";

/**
 * قوالب الأركان (content/pillars.json) واختيار أسئلة الاستيضاح.
 *
 * - باب معدّ (14 باباً): ترتيب القالب كما هو، بعد حذف ما ذكره السائل، والإلزامي أولاً حتى 8 أسئلة.
 * - باب آخر (other): الأركان العامة + 3 إلى 6 أسئلة يولّدها النموذج، تمر على isSafeQuestion.
 *
 * الملف نقي (بلا نموذج ولا شبكة) ليُختبر محلياً: tests/case.test.ts.
 */

export type PillarOption = { value: string; ar: string; en: string };

export type PillarQuestion = {
  key: string;
  ar: string;
  en: string;
  type: AnswerType;
  options?: PillarOption[];
  required: boolean;
  generated?: boolean;
};

type ChapterTemplate = { ar: string; en: string; ref: string; order: string[]; questions: PillarQuestion[] };

export const PILLARS = pillars as unknown as {
  version: number;
  limits: { maxQuestions: number; generatedMin: number; generatedMax: number };
  generationRules: { ar: string[]; en: string[] };
  general: PillarQuestion[];
  chapters: Record<Exclude<Chapter, "other">, ChapterTemplate>;
};

export const MAX_QUESTIONS = PILLARS.limits.maxQuestions;
export const GENERATED_MIN = PILLARS.limits.generatedMin;
export const GENERATED_MAX = PILLARS.limits.generatedMax;

/** ترتيب الأركان العامة لباب غير معدّ؛ «generated» موضع الأسئلة المولّدة. */
const OTHER_ORDER = ["occurred", "who", "what_exactly", "generated", "when", "country", "state_intent", "asked_before", "madhhab"];

export function isChapter(value: unknown): value is Chapter {
  return typeof value === "string" && (CHAPTERS as readonly string[]).includes(value);
}

/** اسم الباب للعرض (العربية للعربية، والإنجليزية لغيرها). */
export function chapterName(chapter: string | null | undefined, lang = "ar"): string {
  const template = isChapter(chapter) && chapter !== "other" ? PILLARS.chapters[chapter] : null;
  if (!template) return lang === "ar" ? "باب آخر" : "Other";
  return lang === "ar" ? template.ar : template.en;
}

const GENERAL_BY_KEY = new Map(PILLARS.general.map((q) => [q.key, q]));

/** كل أسئلة الباب مرتبة (العامة والخاصة)، قبل حذف المعروف وقبل الحد. */
export function templateFor(chapter: Chapter, generated: PillarQuestion[] = []): PillarQuestion[] {
  if (chapter === "other") {
    return OTHER_ORDER.flatMap((key) => (key === "generated" ? generated : [GENERAL_BY_KEY.get(key)!]));
  }
  const template = PILLARS.chapters[chapter];
  const own = new Map(template.questions.map((q) => [q.key, q]));
  return template.order.map((key) => own.get(key) ?? GENERAL_BY_KEY.get(key)).filter((q): q is PillarQuestion => Boolean(q));
}

/**
 * أسئلة الاستيضاح: بلا ما ذكره السائل (known)، والإلزامي أولاً ثم الاختياري، حتى max،
 * مع حفظ ترتيب القالب.
 */
export function selectQuestions(
  chapter: Chapter,
  known: Iterable<string> = [],
  generated: PillarQuestion[] = [],
  max = MAX_QUESTIONS,
): PillarQuestion[] {
  const skip = new Set(known);
  const pool = templateFor(chapter, generated).filter((q) => !skip.has(q.key));
  const chosen = new Set<string>();
  for (const q of pool) if (q.required && chosen.size < max) chosen.add(q.key);
  for (const q of pool) if (!q.required && chosen.size < max) chosen.add(q.key);
  return pool.filter((q) => chosen.has(q.key));
}

// ---------------------------------------------------------------------------
// فحص الأسئلة المولّدة بالكود (السبيكات 3.1): لا حكم، ولا هوية، ولا تفاصيل جنسية.
// ---------------------------------------------------------------------------

const PRIVATE: RegExp[] = [
  // الهوية والتواصل
  /((?<!(دون|بدون|بلا)\s)(اسم|أسماء)|رقم\s*(الهوية|الجواز|الحساب|هاتف|الهاتف|جوال)|هويتك|جواز|حساب\s*(بنكي|مصرفي)|آيبان|عنوانك|عنوان\s*السكن|هاتفك|جوالك|بريدك|إيميل)/u,
  /(?<!(without|no)\s)\bnames?\b|\b(surname|passport|id\s*(number|card)|national\s*id|social\s*security|bank\s*account|iban|account\s*number|phone|mobile|e-?mail|address|street)\b/i,
  // التفاصيل الجنسية
  /(جماع|الجماع|جنس|جنسي|وطء|وطئ|إنزال|عورة|قبلة|مداعبة|استمناء|زنا)/u,
  /\b(sex|sexual|intercourse|ejaculat\w*|masturbat\w*|foreplay|orgasm|aroused|naked)\b/i,
];

const RULING: RegExp[] = [
  // الأحكام والآراء
  /(يجوز|تجوز|جائز|يحل|حلال|حرام|محرم|مكروه|مباح|واجب|يجب|فتوى|حكم\s+(الشرع|ذلك|هذا|الله))/u,
  /\b(permissible|permitted|allowed|forbidden|haram|halal|makruh|obligatory|ruling|fatwa|sinful|is\s+it\s+(ok|okay|valid))\b/i,
];

/** هل يطلب النص هوية (اسم، رقم، حساب، هاتف، عنوان) أو تفاصيل جنسية؟ (يُطبَّق على القوالب أيضاً) */
export function asksPrivate(text: string): boolean {
  return PRIVATE.some((r) => r.test(text));
}

/** نص بلا هوية ولا تفاصيل جنسية ولا حكم. */
export function isSafeText(text: string): boolean {
  return !asksPrivate(text) && !RULING.some((r) => r.test(text));
}

/** هل السؤال المولّد آمن: قصير، عن وقائع فقط، بلا هوية ولا تفاصيل جنسية ولا حكم؟ */
export function isSafeQuestion(text: string): boolean {
  const t = text.trim();
  return t.length >= 4 && t.length <= 240 && isSafeText(t);
}

/** يتحقق من كل الأسئلة المولّدة: يُسقط غير الآمن، ويُبقي 3–6 وإلا لا شيء (فتُكفى الأركان العامة). */
export function safeGenerated(questions: PillarQuestion[]): PillarQuestion[] {
  const safe = questions
    .filter((q) => isSafeQuestion(q.ar) && isSafeQuestion(q.en))
    .filter((q) => (q.options ?? []).every((o) => isSafeText(o.ar) && isSafeText(o.en)))
    .slice(0, GENERATED_MAX)
    .map((q, i) => ({ ...q, key: `gen_${i + 1}`, required: true, generated: true }));
  return safe.length >= GENERATED_MIN ? safe : [];
}


/** كل أسئلة القوالب بمفاتيحها (العامة والخاصة). */
export function allQuestionsByKey(): Map<string, PillarQuestion> {
  const map = new Map(PILLARS.general.map((q) => [q.key, q]));
  for (const t of Object.values(PILLARS.chapters)) for (const q of t.questions) map.set(q.key, q);
  return map;
}
