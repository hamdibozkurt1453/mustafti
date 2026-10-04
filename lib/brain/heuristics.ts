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
