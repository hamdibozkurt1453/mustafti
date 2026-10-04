import pillars from "@/content/pillars.json";
import { CHAPTERS } from "@/lib/brain/prompts";
import type { AnswerType, Chapter } from "./types";

/**
 * قوالب الأركان (content/pillars.json) واختيار أسئلة الاستيضاح.
 *
 * - الباب: يختاره النموذج بدرجة ثقة، والكود يقرر (chooseChapter): الجنايات وما لا يطابق بثقة عالية ⇒ other.
 * - حالة شخصية في باب معدّ: ترتيب القالب، بعد حذف ما ذكره السائل، والإلزامي أولاً حتى 8 أسئلة.
 * - حالة شخصية في باب آخر: أركان عامة قليلة + 3 إلى 6 أسئلة يولّدها النموذج من نص السؤال.
 * - سؤال حكم عام: 2 إلى 4 أسئلة مولّدة عن الشروط المؤثرة في الحكم فقط.
 * - كل سؤال مولّد يمر على isSafeQuestion: لا حكم، ولا هوية (من فعل؟ من هو؟ أين يسكن؟)، ولا تفاصيل جنسية.
 *
 * الملف نقي (بلا نموذج ولا شبكة) ليُختبر محلياً: tests/case.test.ts.
 */

export type PillarOption = { value: string; ar: string; en: string };

export type PillarQuestion = {
  key: string;
  ar: string;
  en: string;
  /** «لماذا نسأل؟»: أثر الجواب في الحكم. */
  why?: { ar: string; en: string };
  type: AnswerType;
  options?: PillarOption[];
  required: boolean;
  generated?: boolean;
};

type ChapterTemplate = { ar: string; en: string; ref: string; order: string[]; questions: PillarQuestion[] };

export const PILLARS = pillars as unknown as {
  version: number;
  limits: { maxQuestions: number; generatedMin: number; generatedMax: number; rulingMin: number; rulingMax: number };
  generationRules: { ar: string[]; en: string[] };
  general: PillarQuestion[];
  chapters: Record<Exclude<Chapter, "other">, ChapterTemplate>;
  /** الاحتياطي إن تعذّر توليد الأسئلة: 3 أسئلة عن الوقائع العامة، لا سؤال واحد عام. */
  fallback: string[];
};

export const MAX_QUESTIONS = PILLARS.limits.maxQuestions;
export const GENERATED_MIN = PILLARS.limits.generatedMin;
export const GENERATED_MAX = PILLARS.limits.generatedMax;
export const RULING_MIN = PILLARS.limits.rulingMin;
export const RULING_MAX = PILLARS.limits.rulingMax;

/** ترتيب الأركان العامة لباب غير معدّ؛ «generated» موضع الأسئلة المولّدة. */
const OTHER_ORDER = ["occurred", "what_exactly", "generated", "when", "state_intent", "asked_before", "madhhab"];

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

/** الاحتياطي: ما الذي حدث بالضبط؟ ما الظرف أو الضرورة؟ هل وقع أم تسأل قبل الفعل؟ */
export function fallbackQuestions(): PillarQuestion[] {
  return PILLARS.fallback.map((key) => GENERAL_BY_KEY.get(key)!);
}

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
  kind: "personal" | "ruling" = "personal",
): PillarQuestion[] {
  // سؤال الحكم العام: الشروط المؤثرة فقط (2–4)، لا قالب ولا أركان عامة. بلا نموذج: سؤال الظروف وحده.
  if (kind === "ruling") return generated.length ? generated.slice(0, RULING_MAX) : fallbackQuestions();
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
  // أسلوب المحقق: من فعل؟ من هو؟ أين يسكن؟
  /(^|[\s«"(])(من|مَن)\s+(الذي|الذى|التي|هو|هي|هم|هما|فعل|فعلت|سرق|سرقت|قام|قامت|ارتكب|ارتكبت|أخذ|أخذت|قتل|ضرب|السارق|الفاعل|الجاني|الشخص)(?![\p{L}])/u,
  /(أين|اين)\s+(يسكن|تسكن|يسكنون|يقيم|تقيم|يعيش|تعيش|يعمل|تعمل)/u,
  /(ما|ماذا)\s+(اسمه|اسمها|اسمهم|هويته|هويتها|جنسيته|جنسيتها|عنوانه|عنوانها)/u,
  /\bwho\s+(did|was|is|are|were|stole|took|committed|hit|killed|exactly|the\s+(person|thief|culprit))\b/i,
  /\bwhere\s+(does|do|did)\s+(he|she|they|the\s+\w+)\s+(live|reside|stay|work)\b/i,
  /\b(kim|kimdi|kimin)\b|\bnerede\s+(oturuyor|yaşıyor)\b|\bqui\s+(a|est|était)\b|\bsiapa\s+(yang|dia|pelaku)\b/iu,
];

/** السؤال عن عمل شخص أو وظيفته: ممنوع إلا إن كان العمل نفسه موضوع المسألة. */
const JOB: RegExp[] = [
  /(ما|ماذا)\s+(عمله|عملها|عملهم|عملك|وظيفته|وظيفتها|وظيفتك|مهنته|مهنتها|مهنتك)|(أين|اين)\s+(يعمل|تعمل)/u,
  /\bwhat\s+(is|was|are)\s+(his|her|their|your)\s+(job|occupation|work|profession)\b|\bwhere\s+(does|do)\s+(he|she|they|you)\s+work\b/i,
];

/** هل موضوع المسألة العمل نفسه (فيُسمح بسؤال العمل)؟ */
export function isAboutWork(text: string): boolean {
  return /(عمل|وظيف|مهن|راتب|دخل|شغل|تجار)|\b(job|work|salary|income|career|employ\w*|business|iş|maaş|travail|emploi|salaire|pekerjaan|gaji)\b/iu.test(text);
}

const RULING: RegExp[] = [
  // الأحكام والآراء
  /(يجوز|تجوز|جائز|يحل|حلال|حرام|محرم|مكروه|مباح|واجب|يجب|فتوى|حكم\s+(الشرع|ذلك|هذا|الله))/u,
  /\b(permissible|permitted|allowed|forbidden|haram|halal|makruh|obligatory|ruling|fatwa|sinful|is\s+it\s+(ok|okay|valid))\b/i,
];

/** هل يطلب النص هوية (اسم، رقم، حساب، هاتف، عنوان) أو تفاصيل جنسية؟ (يُطبَّق على القوالب أيضاً) */
export function asksPrivate(text: string): boolean {
  return PRIVATE.some((r) => r.test(text));
}

/** نص بلا هوية ولا تفاصيل جنسية ولا حكم (وبلا سؤال عن العمل إلا إن كان موضوع المسألة). */
export function isSafeText(text: string, allowJob = false): boolean {
  return !asksPrivate(text) && !RULING.some((r) => r.test(text)) && (allowJob || !JOB.some((r) => r.test(text)));
}

/** هل السؤال المولّد آمن: قصير، عن وقائع فقط، بلا هوية ولا تفاصيل جنسية ولا حكم؟ */
export function isSafeQuestion(text: string, allowJob = false): boolean {
  const t = text.trim();
  return t.length >= 4 && t.length <= 240 && isSafeText(t, allowJob);
}

export type GeneratedLimits = { min: number; max: number; allowJob?: boolean };

/** سبب رفض سؤال مولّد، أو null إن كان آمناً. */
export function dropReason(q: PillarQuestion, allowJob = false): string | null {
  const texts = [q.ar, q.en];
  if (texts.some((t) => !t || t.trim().length < 4)) return "too_short";
  if (texts.some((t) => t.trim().length > 240)) return "too_long";
  if (texts.some((t) => asksPrivate(t))) return "identity_or_sexual";
  if (texts.some((t) => RULING.some((r) => r.test(t)))) return "ruling_word";
  if (!allowJob && texts.some((t) => JOB.some((r) => r.test(t)))) return "job";
  if (q.why && [q.why.ar, q.why.en].some((t) => !isSafeText(t, allowJob))) return "why_unsafe";
  if ((q.options ?? []).some((o) => !isSafeText(o.ar, allowJob) || !isSafeText(o.en, allowJob))) return "option_unsafe";
  return null;
}

export type GeneratedReport = { kept: PillarQuestion[]; dropped: { ar: string; reason: string }[] };

/** «غير ذلك» يضيفه المتصفح (بالكتابة)، فلا يُكرر في خيارات النموذج. */
const OTHER_OPTION = /^(غير\s+ذلك|أخرى|آخر|other|others|something\s+else|diğer|başka|autre|lainnya|dll)\.?$/iu;

/**
 * يفحص الأسئلة المولّدة ويعيد المقبول والمحذوف مع سبب كل حذف: غير الآمن، والمكرر، وما زاد على max.
 * (min يطبّقه المستدعي: إعادة التوليد مرة، ثم الاحتياطي.)
 */
export function checkGenerated(questions: PillarQuestion[], limits: GeneratedLimits): GeneratedReport {
  const job = Boolean(limits.allowJob);
  const seen = new Set<string>();
  const kept: PillarQuestion[] = [];
  const dropped: GeneratedReport["dropped"] = [];
  for (const raw of questions) {
    const q = { ...raw, options: raw.options?.filter((o) => !OTHER_OPTION.test(o.ar.trim()) && !OTHER_OPTION.test(o.en.trim())) };
    if (q.type === "choice" && (q.options?.length ?? 0) < 2) q.type = "text";
    const reason = dropReason(q, job);
    const key = q.ar.replace(/[^\p{L}]/gu, "");
    if (reason) dropped.push({ ar: q.ar, reason });
    else if (seen.has(key)) dropped.push({ ar: q.ar, reason: "duplicate" });
    else if (kept.length >= limits.max) dropped.push({ ar: q.ar, reason: "over_max" });
    else {
      seen.add(key);
      kept.push({ ...q, key: `gen_${kept.length + 1}`, required: true, generated: true });
    }
  }
  return { kept, dropped };
}

/** المقبول من الأسئلة المولّدة إن بلغ min، وإلا لا شيء. */
export function safeGenerated(
  questions: PillarQuestion[],
  limits: GeneratedLimits = { min: GENERATED_MIN, max: GENERATED_MAX },
): PillarQuestion[] {
  const { kept } = checkGenerated(questions, limits);
  return kept.length >= limits.min ? kept : [];
}

// ---------------------------------------------------------------------------
// اختيار الباب: النموذج بدرجة ثقة، والكود يقرر.
// ---------------------------------------------------------------------------

/** الثقة الدنيا لاستعمال قالب باب معدّ؛ وإلا تُولَّد الأسئلة من نص السؤال. */
export const CHAPTER_MIN_CONFIDENCE = 0.75;

/** الجنايات والدماء والحدود: لا قالب لها بين الأبواب الأربعة عشر، فتُولَّد أسئلتها دائماً. */
const CRIMES =
  /(?<![\p{L}])(?:[وفبل]|ال)?(?:سرق|يسرق|تسرق|سرقت|سرقة|السارق|اختلس|قتل|يقتل|قتلت|جناية|جنايات|اعتداء|اغتصاب|زنا|خمر|سكر|رشوة|غصب|اختطاف|ضرب|يضرب|جرح|يجرح)(?:ه|ها|هم|ة|ني|ك|نا|ت|وا)?(?![\p{L}])|\b(steal\w*|stole|theft|thief|robb\w*|murder\w*|kill\w*|assault\w*|bribe\w*|rape|hırsız\w*|çaldı\w*|cinayet|rüşvet|vol(?:er|é\w*)|meurtre|mencuri|pencurian|membunuh|suap)\b|چوری|قتل/iu;

/** كلمات صريحة لكل باب (احتياط إن تعذّر النموذج، وفي الاختبارات). */
const CHAPTER_WORDS: [Exclude<Chapter, "other">, RegExp][] = [
  ["talaq_khul", /طل[ّ]?ق|طلاق|خلع|\b(divorc\w*|talaq|khul\w*|boşan\w*|cerai|talak)\b|طلاق/iu],
  ["inheritance_wills", /ور[ّ]?ث|ميراث|تركة|وصية|\b(inherit\w*|heirs?|estate|last\s+will|testament|miras|vasiyet|héritage|warisan)\b|وراثت/iu],
  ["siyam", /صيام|صوم|أفطرت|افطرت|رمضان|\b(fast(ing)?|ramadan|oruç|jeûne|puasa)\b/iu],
  ["salah", /صلاة|صليت|ركعة|سجود|\b(prayer|pray(ed)?|salah|namaz|prière|shalat|salat)\b|نماز/iu],
  ["zakah", /زكاة|نصاب|\b(zakat|zakah|nisab|zekat)\b/iu],
  ["hajj_umrah", /(?<![\p{L}])(?:[وفبل]|ال|وال)?(?:حج|حجة|حجي|عمرة|عمرتي)(?![\p{L}])|إحرام|احرام|\b(hajj|umrah|ihram|hac|umre)\b/iu],
  ["taharah", /وضوء|غسل|تيمم|نجاسة|حيض|طهارة|\b(wudu|ghusl|ablution|tayammum|abdest|gusül)\b/iu],
  ["nikah", /زواج|نكاح|مهر|خطبة|\b(marri\w*|nikah|mahr|wedding|evlilik|mariage|pernikahan)\b/iu],
  ["finance", /قرض|ربا|فائدة|بنك|تقسيط|أسهم|تأمين|\b(loan|mortgage|interest|riba|bank|insurance|shares|crypto|kredi|faiz|prêt|pinjaman)\b/iu],
  ["food_slaughter", /ذبيحة|ذبح|لحم|طعام|أكل|جيلاتين|\b(meat|slaughter\w*|gelatin|food|eat|viande|daging)\b/iu],
  ["dress_adornment", /حجاب|لباس|وشم|(?<![\p{L}])(?:ال|بال)ذهب(?![\p{L}])|حرير|لحية|\b(hijab|tattoo|beard|dress|clothing|gold|silk|dövme|tatouage|jilbab)\b/iu],
  ["oaths_vows_expiations", /حلفت|يمين|نذر|كفارة|\b(oath|vow|swore|kaffara\w*|yemin|adak|serment|sumpah|nazar)\b/iu],
  ["non_muslim_relations", /غير\s+المسلمين|النصارى|اليهود|كافر|مسيحي|الكنيسة|\b(non-?muslims?|christians?|church|christmas|noël|natal)\b/iu],
  ["new_muslim", /أسلمت|اسلمت|مسلم\s+جديد|حديث\s+الإسلام|\b(convert(ed)?|revert(ed)?|new\s+muslim|became\s+muslim|müslüman\s+oldum|mualaf)\b/iu],
];

/** أول باب تطابقه كلمة صريحة في السؤال، أو null. */
export function keywordChapter(text: string): Exclude<Chapter, "other"> | null {
  return CHAPTER_WORDS.find(([, re]) => re.test(text))?.[0] ?? null;
}

export function looksCrime(text: string): boolean {
  return CRIMES.test(text);
}

/**
 * الباب النهائي للاستيضاح:
 * 1) الجنايات والدماء ⇒ other دائماً (أسئلة مولّدة من نص السؤال، لا قالب المعاملات).
 * 2) اختيار النموذج إن كانت ثقته عالية (0.75 فأكثر).
 * 3) إن تعذّر النموذج: كلمة صريحة في السؤال، وإلا other.
 * ثقة النموذج المنخفضة ⇒ other.
 */
export function chooseChapter(question: string, model: { chapter: string; confidence: number } | null): Chapter {
  if (looksCrime(question)) return "other";
  if (model) return isChapter(model.chapter) && model.confidence >= CHAPTER_MIN_CONFIDENCE ? model.chapter : "other";
  return keywordChapter(question) ?? "other";
}


/** كل أسئلة القوالب بمفاتيحها (العامة والخاصة). */
export function allQuestionsByKey(): Map<string, PillarQuestion> {
  const map = new Map(PILLARS.general.map((q) => [q.key, q]));
  for (const t of Object.values(PILLARS.chapters)) for (const q of t.questions) map.set(q.key, q);
  return map;
}
