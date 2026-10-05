import type { ReferralKind } from "@/lib/case/types";

/**
 * شبكة أمان بالكود فوق المصنّف: ترفع المستوى ولا تخفّضه أبداً.
 * - طلب حكم على حالة السائل نفسه ⇒ D (حتى لو أخطأ النموذج فصنّفه A أو B).
 * - كلمات الخطر على النفس ⇒ urgent.
 */

/** \b في JS لا يعرف الحروف غير اللاتينية (ı ç é): نستبدله بحدود Unicode. */
function wb(re: RegExp): RegExp {
  return new RegExp(re.source.replaceAll("\\b", "(?:(?<![\\p{L}])(?=[\\p{L}])|(?<=[\\p{L}])(?![\\p{L}]))"), re.flags);
}

const PERSONAL: RegExp[] = [
  // العربية: هل يجوز لي، هل يحل لي، هل صلاتي صحيحة، هل وقع طلاقي، طلقت زوجتي…
  /(هل|أ)\s*(يجوز|يحل|يحق|يصح|يلزم|يجب)\s*(لي|علي|عليّ|لنا|علينا)/u,
  /(?<![\p{L}\p{M}])(صلاتي|صومي|صيامي|زواجي|نكاحي|عقدي|حجي|عمرتي|وضوئي|طلاقي|زكاتي)(?![\p{L}\p{M}])/u,
  /(طلقت|طلّقت)\s+(زوجتي|امرأتي)|(وقع|يقع)\s+(طلاقي|الطلاق\s+علي)/u,
  /(ماذا|ما\s+الذي)\s+(علي|عليّ|يجب\s+علي)/u,
  /(حلال|حرام|جائز|جائزة|مباح|مباحة)\s+(لي|علي|عليّ|لنا|علينا)(?![\p{L}])/u,
  // English
  /\b(can|may|should|must)\s+i\b|\bam\s+i\s+(allowed|permitted|obliged|sinning)\b|\bis\s+it\s+(haram|halal|allowed|permissible|ok|okay)\s+for\s+me\b/i,
  /\bmy\s+(prayer|fast|marriage|nikah|divorce|wudu|ablution|hajj|umrah|zakat)\b/i,
  /\bfor\s+me\b.*\b(haram|halal|allowed|permissible)\b|\b(haram|halal|allowed|permissible)\b.*\bfor\s+me\b/i,
  // Türkçe
  wb(/\b(benim\s+için|bana)\b.*\b(caiz|haram|helal)|\b(caiz|haram|helal)\b.*\b(benim\s+için|bana)\b/iu),
  wb(/\b(namazım|orucum|nikahım|boşanmam|abdestim)\b/iu),
  wb(/\b(kullanmam|yapmam|yemem|içmem|almam|çalışmam)\s+(caiz|helal|haram)/iu),
  // Français
  wb(/\b(ai[- ]je\s+le\s+droit|puis[- ]je|dois[- ]je|est[- ]ce\s+que\s+je\s+peux)\b/iu),
  wb(/\b(mon|ma|mes)\s+(prière|jeûne|mariage|divorce|ablutions?)\b/iu),
  // اردو
  /(میرا|میری|میرے)\s+(روزہ|نماز|نکاح|طلاق|وضو)|کیا\s+میں\s+.*\s+(سکتا|سکتی)/u,
  // Indonesia
  wb(/\b(bagi\s+saya|untuk\s+saya)\b.*\b(halal|haram|boleh)\b|\b(halal|haram|boleh)\b.*\b(bagi\s+saya|untuk\s+saya)\b/iu),
  wb(/\b(shalat|salat|puasa|nikah|pernikahan|talak|wudhu)\s+saya\b/iu),
];

const URGENT: RegExp[] = [
  /(انتحار|أنتحر|انتحر|أقتل\s+نفسي|اقتل\s+نفسي|أنهي\s+حياتي|لا\s+أريد\s+أن\s+أعيش|يضربني|تضربني|هددني\s+بالقتل|يهددني|اعتداء|اغتصاب|لا\s+يتنفس|لا\s+تتنفس|نزيف)/u,
  /\b(suicide|kill\s+myself|end\s+my\s+life|don'?t\s+want\s+to\s+live|self[- ]harm|hurt\s+myself|beats?\s+me|abus(e|ing)\s+me|threaten(ed|s)?\s+to\s+kill|not\s+breathing|overdose)\b/i,
  wb(/\b(intihar|kendimi\s+öldür|yaşamak\s+istemiyorum|beni\s+dövüyor|nefes\s+almıyor|bayıldı)\b/iu),
  wb(/\b(suicide|me\s+tuer|ne\s+veux\s+plus\s+vivre|me\s+frappe|ne\s+respire\s+(plus|pas))\b/iu),
  /(خودکشی|مجھے\s+مارتا|سانس\s+نہیں)/u,
  wb(/\b(bunuh\s+diri|tidak\s+ingin\s+hidup|memukul\s+saya|tidak\s+bernapas)\b/iu),
];

export function looksPersonal(text: string): boolean {
  return PERSONAL.some((r) => r.test(text));
}

export function looksUrgent(text: string): boolean {
  return URGENT.some((r) => r.test(text));
}

/**
 * سؤال حكم على واقعة لشخص («ما حكم من يسرق وهو مضطر؟»، "ruling on someone who…"):
 * «الحكم على واقعة فردية» في المستوى D، وإن لم تكن حالة السائل نفسه. يرفع إلى D فقط.
 */
const CASE_RULING: RegExp[] = [
  /ما\s*(هو\s+)?(حكم|الحكم\s+في)\s+(من|مَن|مَنْ|الذي|التي|رجل|امرأة|شخص)\s/u,
  /\b(what\s+is|what'?s)\s+the\s+(islamic\s+)?ruling\s+(on|for|of|about)\s+(someone|somebody|a\s+(person|man|woman|muslim)|anyone|people|those|one)\s+who\b/i,
  wb(/\b(birinin|kişinin|kimsenin)\b.*\bhükmü\b/iu),
  wb(/\b(quel\s+est\s+le\s+(jugement|statut|avis)|que\s+dit\s+l'islam)\b.*\b(celui|quelqu'un|une\s+personne)\s+qui\b/iu),
  /جو\s+شخص.*(کا|کی)\s+حکم|(اس|ایسے)\s+شخص\s+کا\s+(کیا\s+)?حکم/u,
  wb(/\b(apa\s+)?hukum(nya)?\s+(orang|seseorang)\s+yang\b/iu),
];

/** طلب حكم عام (لا عن حالة السائل): لاختيار رسالة الإحالة المناسبة في المستوى D. */
const RULING_ASK: RegExp[] = [
  /(ما|ماهو|ما\s+هو|ما\s+هي)\s*(حكم|الحكم)/u,
  /حكم\s+(من|مَن)\s/u,
  /\b(what\s+is|what'?s)\s+the\s+(islamic\s+)?ruling\b|\bruling\s+(on|of|for|about)\b|\bis\s+it\s+(haram|halal|permissible|allowed)\s+(to|for\s+(a|someone|people|muslims?))\b/i,
  wb(/\bhükmü\s+(nedir|ne)\b|\bcaiz\s+mi(dir)?\b/iu),
  wb(/\b(quel\s+est\s+le\s+(jugement|statut)|est[- ]il\s+permis)\b/iu),
  /(کا|کی)\s+(کیا\s+)?حکم|حکم\s+کیا\s+ہے/u,
  wb(/\b(apa\s+)?hukum(nya)?\b/iu),
];

export function looksCaseRuling(text: string): boolean {
  return CASE_RULING.some((r) => r.test(text));
}

export function looksRulingQuestion(text: string): boolean {
  return RULING_ASK.some((r) => r.test(text));
}

/** نوع رسالة الإحالة في D: حالة السائل نفسه ⇒ personal؛ طلب حكم عام بلا حالة شخصية ⇒ ruling. */
export function referralKindOf(question: string): ReferralKind {
  return !looksPersonal(question) && (looksCaseRuling(question) || looksRulingQuestion(question)) ? "ruling" : "personal";
}

/**
 * وقائع شخصية في السؤال: المتكلم أو قريبه أو شخص بعينه، أو فعل وقع منه («أنا»، «فعلت»، «حدث لي»،
 * «زوجي»…). وحدها تجعل سؤال الحكم حالةً شخصية (D)؛ وبدونها فسؤال الحكم العام B أو C (R1b).
 */
const PERSONAL_FACTS: RegExp[] = [
  /(?<![\p{L}\p{M}])(?:أنا|انا|نحن|عندي|لدي|لديّ|معي|حدث\s+(?:لي|معي)|وقع\s+(?:لي|مني|علي)|أصابني|اصابني)(?![\p{L}\p{M}])/u,
  /(?<![\p{L}\p{M}])(?:زوجي|زوجتي|امرأتي|خطيبي|خطيبتي|أبي|ابي|أمي|امي|والدي|والدتي|ابني|ابنتي|بنتي|أخي|اخي|أختي|اختي|ولدي|أولادي|اولادي|جاري|جارتي|صديقي|صديقتي|مديري|عمي|خالي|جدي|جدتي)(?![\p{L}\p{M}])/u,
  // أفعال المتكلم الماضية الشائعة في الوقائع (نمت، صليت، طلقت، حلفت…).
  /(?<![\p{L}\p{M}])(?:نمت|صليت|صمت|أفطرت|افطرت|طلقت|حلفت|نذرت|سرقت|شربت|أكلت|اكلت|تزوجت|اشتريت|بعت|اقترضت|أقرضت|اقرضت|ورثت|سافرت|نسيت|تركت|فعلت|قلت|كذبت|زنيت|ضربت|جامعت|احتلمت|حضت|نفست|أجهضت|اجهضت|أسلمت|اسلمت|ارتددت|دخلت|خرجت|عملت|اشتغلت|استلفت|أخذت|اخذت|وجدت|دفعت)(?![\p{L}\p{M}])/u,
  /\b(?:i|i'm|i've|i'd|me|my|mine|we|our|us)\b/i,
  wb(/\b(?:ben|benim|bana|beni|biz|bizim|eşim|annem|babam|kocam|karım)\b/iu),
  wb(/\b(?:je|j'ai|moi|mon|ma|mes|nous|notre|mon\s+mari|ma\s+femme)\b/iu),
  /(?<![\p{L}])(?:میں|میرا|میری|میرے|ہم|ہمارا|مجھے)(?![\p{L}])/u,
  wb(/\b(?:saya|aku|kami|suami\s+saya|istri\s+saya)\b/iu),
];

export function looksPersonalFacts(text: string): boolean {
  return PERSONAL_FACTS.some((r) => r.test(text));
}

/** «هل يجوز…؟» و«هل يحل…؟» عموماً (لا «لي»): سؤال حكم عام. */
const GENERAL_RULING: RegExp[] = [
  /هل\s+(?:يجوز|يحل|يصح|يحرم|يباح|يشرع|يجب|يلزم)/u,
  /\bis\s+it\s+(?:allowed|permissible|haram|halal|forbidden|obligatory)\b|\bare\s+muslims\s+allowed\b/i,
];

/**
 * سؤال حكم عام بلا وقائع شخصية: «ما حكم قضاء صلاة الفجر بعد طلوع الشمس؟»، «هل يجوز صيام يوم الجمعة
 * منفرداً؟». هذا B (أو C إن كان فيه خلاف)، لا D. والحكم على «من فعل كذا» (looksCaseRuling) يبقى D.
 */
export function looksGeneralRuling(text: string): boolean {
  if (looksPersonal(text) || looksCaseRuling(text) || looksPersonalFacts(text) || looksUrgent(text)) return false;
  return looksRulingQuestion(text) || GENERAL_RULING.some((r) => r.test(text));
}

