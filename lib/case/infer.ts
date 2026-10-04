import type { Chapter } from "./types";

/**
 * استنتاج «المعلوم» من صيغة السؤال بالكود (يكمّل ما يستنتجه النموذج، ولا يحلّ محله):
 * - الفعل بصيغة الماضي (طلقت، نسيت، ورث، aldım، I took) ⇒ occurred = happened.
 * - المضارع الدال على الاستمرار (أعمل في، çalışıyorum، I work at) ⇒ occurred = ongoing.
 * - «أهلي يرفضون» في قضايا المسلم الجديد ⇒ nmu_issue = family.
 * - «ورث أبي» أو «توفي والدي» ⇒ inh_deceased = father (والأم مثلها).
 * - «نسيت صلاة…» ⇒ salah_issue = missed_prayer، missed_reason = forgot.
 * فلا يُسأل «هل وقع الأمر فعلاً؟» عن فعل وقع أو مستمر. الملف نقي ليُختبر.
 */

const PAST_AR =
  /(?<![\p{L}])(?:و|ف)?(?:طلقت|طلّقت|نسيت|ورث|ورثت|توفي|توفيت|مات|ماتت|أخذت|اخذت|سرقت|اشتريت|بعت|أفطرت|افطرت|صليت|حلفت|نذرت|أسلمت|اسلمت|تزوجت|اقترضت|أكلت|اكلت|شربت|فعلت|قلت|ضربت|تركت|فاتتني|فاتني|خالعت|خلعت|حججت|اعتمرت)(?![\p{L}])/u;
const ONGOING_AR = /(?<![\p{L}])(?:أعمل|اعمل|أشتغل|اشتغل|أدرس|ادرس|أسكن|اسكن|أعيش|اعيش|أتعامل|اتعامل|أدفع|ادفع)(?![\p{L}])|(?<![\p{L}])(?:يرفضون|يرفض|ترفض)(?![\p{L}])/u;
const PAST_EN = /\bi\s+(?:have\s+|had\s+)?(?:(?!need\b|feed\b|proceed\b)\w+ed|took|ate|forgot|swore|got|bought|sold|stole|made|said|left|missed|broke|did|gave|became|converted)\b|\bmy\s+\w+\s+(?:died|passed\s+away)\b/i;
const ONGOING_EN = /\bi\s+(?:am\s+)?(?:work(?:ing)?|live|study|pay)\b|\bi'm\s+(?:working|living|studying|paying)\b/i;
const PAST_TR = /\b\p{L}+(?:dım|dim|dum|düm|tım|tim|tum|tüm)\b/iu;
const ONGOING_TR = /\b\p{L}+(?:ıyorum|iyorum|uyorum|üyorum)\b/iu;
const PAST_FR = /\b(?:j'ai|je\s+suis)\s+\p{L}+/iu;

export function inferKnown(question: string, chapter: Chapter): Record<string, string> {
  const t = question.trim();
  const out: Record<string, string> = {};
  if (ONGOING_AR.test(t) || ONGOING_EN.test(t) || ONGOING_TR.test(t)) out.occurred = "ongoing";
  if (PAST_AR.test(t) || PAST_EN.test(t) || PAST_TR.test(t) || PAST_FR.test(t)) out.occurred = "happened";

  if (chapter === "new_muslim" && /(أهلي|اهلي|عائلتي|والدي|والداي|أبي|أمي|أسرتي|\bmy\s+(family|parents)\b|\bailem\b|\bma\s+famille\b|\bkeluarga\b)/iu.test(t)) {
    out.nmu_issue = "family";
  }
  if (chapter === "inheritance_wills") {
    if (/(ورث|توفي|مات|المتوفى)\s+(أبي|ابي|والدي)|(أبي|ابي|والدي)\s+(المتوفى|توفي|مات)|\bmy\s+father\s+(died|passed)|\bbabam\s+vefat/iu.test(t)) out.inh_deceased = "father";
    else if (/(ورثت|توفيت|ماتت|المتوفاة)\s+(أمي|امي|والدتي)|(أمي|امي|والدتي)\s+(المتوفاة|توفيت|ماتت)|\bmy\s+mother\s+(died|passed)|\bannem\s+vefat/iu.test(t)) out.inh_deceased = "mother";
  }
  if (chapter === "salah" && /(نسيت|فاتتني|فاتني|تركت)\s+(صلاة|الصلاة)|\b(missed|forgot)\s+(the\s+)?(\w+\s+)?prayer|\bnamaz(ı|ı)\s+kaçırdım/iu.test(t)) {
    out.salah_issue = "missed_prayer";
    if (/نسيت|forgot|unuttum/iu.test(t)) out.missed_reason = "forgot";
    else if (/نمت|نام|غلبني\s+النوم|overslept|slept|uyuya/iu.test(t)) out.missed_reason = "sleep";
  }
  if (chapter === "finance" && /(أعمل|اعمل|أشتغل|اشتغل|وظيفتي|راتبي|عملي)|\b(i\s+work|my\s+(job|salary))\b|\b(çalışıyorum|maaşım)\b/iu.test(t)) {
    out.finance_type = "work_income";
  }
  return out;
}
