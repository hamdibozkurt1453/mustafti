/**
 * حذف الهوية بالكود (الطبقة الثانية بعد النموذج، وتُطبَّق ثانيةً على ما يعدّله السائل قبل الحفظ):
 * البريد، والروابط، والهواتف والأرقام الطويلة، والحسابات (IBAN)، والأسماء بعد عبارات التعريف
 * والألقاب والنسب، والعناوين. كل ما يُحذف يُستبدل بـ [محذوف].
 *
 * المقصود الحذف بلا إفراط: الأعداد القصيرة (الأعمار، والسنوات، والمبالغ حتى 7 أرقام) وأسماء
 * البلدان تبقى لأنها من الوقائع التي يحتاجها المفتي. الملف نقي ليُختبر: tests/case.test.ts.
 */

export const REDACTED = "[محذوف]";

const L = "[\\p{L}\\p{M}]";
const D = "[0-9٠-٩۰-۹]";

/** كلمات ليست أسماء (حتى لا يُحذف ما بعد اللقب إن لم يكن اسماً). */
const AR_STOP = new Set(
  "في من عن على إلى الى و أو ثم لأن لكن هو هي أنا نحن هم كان كانت قد لم لن لا ما هل التي الذي الذين بعد قبل عند مع كل بعض غير أن إن إذا لما حتى منذ قال قالت يقول وقال فقال المسجد".split(" "),
);

/** صلات القرابة: «زوجتي بنت عمي» ليست اسماً. */
const KIN = /^(?:و?(?:زوج|زوجة|زوجتي|زوجي|امرأتي|أب|أبي|أبوه|أم|أمي|أخ|أخي|أخت|أختي|عم|عمي|عمه|عمها|عمة|عمتي|خال|خالي|خاله|خالة|خالتي|جد|جدي|جدة|جدتي|ابني|ابنتي|بنتي|ولدي|عمّي|خالي|أخيه|أخته))$/u;

function isNameWord(word: string): boolean {
  return !AR_STOP.has(word) && !KIN.test(word) && !/^(و|ف)?(في|من|عن)$/u.test(word);
}

const RULES: RegExp[] = [
  // البريد والروابط
  /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu,
  /\b(?:https?:\/\/|www\.)\S+/giu,
  // IBAN ونحوه: حرفان ورقمان ثم 10 خانات فأكثر
  /\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]){10,30}\b/giu,
  // الهواتف: + أو 00 ثم 7 أرقام فأكثر
  new RegExp(`(?:\\+|00)${D}(?:[\\s().-]{0,2}${D}){6,}`, "gu"),
  // الأرقام الطويلة: 8 أرقام فأكثر (بفواصل أو بدونها)
  new RegExp(`(?<![\\p{N}])${D}(?:[\\s().-]?${D}){7,}(?![\\p{N}])`, "gu"),
  // العناوين
  new RegExp(`(?:شارع|عمارة|بناية|شقة\\s+رقم|مبنى\\s+رقم|صندوق\\s+بريد|ص\\.\\s?ب\\.?|الرمز\\s+البريدي)\\s+(?:رقم\\s+)?(?:${D}+|(?:${L}+\\s+){0,2}${L}+)(?:\\s+(?:رقم\\s+)?${D}+)?`, "gu"),
  /\b\d{1,5}[,\s]+(?:\p{Lu}[\p{L}'-]+\s+){1,3}(?:Street|St\.?|Road|Rd\.?|Avenue|Ave\.?|Lane|Ln\.?|Boulevard|Blvd\.?|Drive|Way|Court|Ct\.?)(?![\p{L}])/gu,
  /\b(?:P\.?\s?O\.?\s+Box|Postfach)\s+\d+/giu,
  /[\p{L}]+\s+(?:Sokak|Sokağı|Sok\.|Caddesi|Cad\.|Mahallesi|Mah\.)(?:\s+No\s*:?\s*\d+)?/giu,
  /\b\d{1,4},?\s+(?:rue|avenue|boulevard|bd|chemin|allée|impasse)\s+(?:d[eu']\s*)?[\p{L}'-]+(?:\s+[\p{L}'-]+)?/giu,
  /\b(?:Jalan|Jl\.)\s+[\p{L}]+(?:\s+No\.?\s*\d+)?/giu,
  // الأسماء بعد عبارات التعريف بلغات السائلين
  /\b(?:my\s+name\s+is|i\s+am\s+called|i'm\s+called)\s+[\p{L}'-]+(?:\s+\p{Lu}[\p{L}'-]+){0,2}/giu,
  /\b(?:Mr|Mrs|Ms|Miss|Dr|Sheikh|Shaykh|Brother|Sister|Mme|M\.|Monsieur|Madame|Pak|Bu|Bapak|Ibu)\.?\s+\p{Lu}[\p{L}'-]+(?:\s+\p{Lu}[\p{L}'-]+)?/gu,
  /\b(?:je\s+m'appelle|mon\s+nom\s+est|adım|ismim|nama\s+saya)\s+[\p{L}'-]+(?:\s+\p{Lu}[\p{L}'-]+)?/giu,
  /\p{Lu}[\p{L}]+\s+(?:Bey|Hanım)(?![\p{L}])/gu,
  /(?:میرا|میری)\s+نام\s+\S+(?:\s+ہے)?/gu,
];

/** الأسماء العربية: بعد «اسمي/اسمه/اسم زوجتي…»، وبعد الألقاب، وفي النسب («فلان بن فلان») والكنى. */
function redactArabicNames(text: string): string {
  let out = text;
  // «اسمي أحمد»، «اسم زوجتي فاطمة»، «اسمه هو خالد»
  out = out.replace(
    new RegExp(`((?:إ|ا)سم(?:ي|ه|ها|ك)?(?:\\s+(?:زوجتي|زوجي|أبي|أمي|ابني|ابنتي|أخي|أختي|المتوفى|المتوفاة))?\\s+(?:هو\\s+|هي\\s+)?)(${L}+)((?:\\s+(?:بن|بنت|ابن)\\s+${L}+)*)`, "gu"),
    (all, lead: string, name: string) => (isNameWord(name) ? `${lead}${REDACTED}` : all),
  );
  // الألقاب: «الشيخ فلان»، «الأستاذ فلان»
  out = out.replace(
    new RegExp(`((?:^|\\s)(?:السيد|السيدة|الأستاذ|الأستاذة|الشيخ|الدكتور|الدكتورة|المهندس|المهندسة|الحاج|الحاجة|د\\.)\\s+)(${L}+)`, "gu"),
    (all, lead: string, name: string) => (isNameWord(name) && !name.startsWith("ال") ? `${lead}${REDACTED}` : all),
  );
  // النسب: «محمد بن عبد الله»
  out = out.replace(
    new RegExp(`(${L}+)\\s+(بن|بنت|ابن)\\s+(${L}+)`, "gu"),
    (all, first: string, _link: string, second: string) =>
      isNameWord(first) && !KIN.test(second) && !AR_STOP.has(second) && !first.startsWith("ال") ? REDACTED : all,
  );
  // الكنى: «أبو فلان»
  out = out.replace(new RegExp(`(?<!${L})(?:أبو|ابو)\\s+(${L}+)`, "gu"), (all, name: string) =>
    isNameWord(name) ? REDACTED : all,
  );
  return out;
}

/** يحذف ما يدل على الهوية من نص ويضع مكانه [محذوف]. */
export function redactText(text: string): string {
  let out = text;
  for (const re of RULES) out = out.replace(re, REDACTED);
  out = redactArabicNames(out);
  // [محذوف] [محذوف] ← [محذوف]
  const esc = REDACTED.replace(/[[\]]/g, "\\$&");
  return out.replace(new RegExp(`${esc}(?:[\\s,،.-]*${esc})+`, "gu"), REDACTED);
}
