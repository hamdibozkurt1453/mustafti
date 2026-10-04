/**
 * أنواع مسار المستوى D (الاستيضاح وملف المسألة)، مشتركة بين الخادم والمتصفح.
 * الملف نقي (بلا server-only) فيُستورد في الواجهة والاختبارات.
 */

import type { CHAPTERS } from "@/lib/brain/prompts";

export type Chapter = (typeof CHAPTERS)[number];

export type AnswerType = "choice" | "number" | "text" | "yesno";

/** نوع رسالة الإحالة: حالة شخصية («طلقت زوجتي…») أو سؤال عن حكم عام («ما حكم من…»). */
export type ReferralKind = "personal" | "ruling";

export type PlanOption = { value: string; label: string };

/** شرط العرض: لا يُسأل السؤال إلا إن كان جواب key (قيمة خيار) ضمن in، أو خارج notIn. */
export type ShowIf = { key: string; in?: string[]; notIn?: string[] };

/** سؤال استيضاح جاهز للعرض بلغة السائل. */
export type PlanQuestion = {
  key: string;
  /** نص السؤال بلغة السائل. */
  text: string;
  /** نص السؤال بالعربية (للملف الذي يقرؤه المفتي). */
  textAr: string;
  /** «لماذا نسأل؟» بلغة السائل وبالعربية. */
  why: string;
  whyAr: string;
  type: AnswerType;
  options: PlanOption[];
  required: boolean;
  /** سؤال ولّده النموذج (يقرؤه المفتي بهذه الصفة). */
  generated?: boolean;
  showIf?: ShowIf;
  /** لا يُعرض إن عُرف أحد هذه الأركان (state_intent بعد معرفة سبب الفوات أو درجة الغضب). */
  hideIf?: string[];
};

/** واقعة ذكرها السائل في سؤاله، فلا يُسأل عنها. */
export type KnownFact = { key: string; text: string; textAr: string; value: string; /** قيمة الخيار إن طابق خياراً. */ option?: string };

export type CasePlan = {
  chapter: Chapter;
  lang: string;
  questions: PlanQuestion[];
  known: KnownFact[];
};

/** جواب السائل عن سؤال استيضاح؛ value = null يعني «تخطَّ». */
export type CaseAnswer = { key: string; value: string | null };

/** صف في جدول الأركان. */
export type CaseRow = {
  key: string;
  labelAr: string;
  label: string;
  valueAr: string;
  value: string;
  generated?: boolean;
  /** من نص السؤال نفسه، أو من جواب الاستيضاح. */
  source: "question" | "answer";
};

export type CaseUnknown = { key: string; labelAr: string; label: string };

/** ملف المسألة قبل الإرسال (بعد حذف الهوية). */
export type CaseDraft = {
  /** السؤال الأصلي بعد حذف الهوية. */
  question: string;
  summaryAr: string;
  summaryUser: string;
  rows: CaseRow[];
  unknowns: CaseUnknown[];
};

export const CASE_LIMITS = {
  maxQuestions: 8,
  /** الأسئلة المرشحة في الخطة قبل الشروط والحد (يُسأل منها 8 على الأكثر). */
  planQuestions: 24,
  question: 2000,
  summary: 4000,
  value: 600,
  email: 200,
} as const;
