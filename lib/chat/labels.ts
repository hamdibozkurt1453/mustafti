/**
 * تسميات حقول الحديث في نص بطاقة المصدر بلغة الواجهة (R5): خادم MCP يعيد نص الحديث بتسميات
 * إنجليزية («Narrator:»، «Grade:»، «Explanation:») فتظهر في الواجهة العربية. تُستبدل التسمية في أول
 * السطر وحدها (قبل «:»)، والنص بعدها كما هو حرفياً. ملف نقي: يُستورد في الواجهة والاختبارات.
 */

export const LABEL_KEYS = ["narrator", "grade", "explanation", "benefits", "source", "translation", "hadith"] as const;
export type LabelKey = (typeof LABEL_KEYS)[number];

/** صيغ كل تسمية كما قد تأتي من المصادر (بلغات الواجهة الشائعة). */
const ALIASES: Record<LabelKey, string[]> = {
  narrator: ["Narrator", "Narrated by", "Narrated", "الراوي", "Râvi", "Ravi", "Rapporteur", "Narrateur", "Perawi", "راوی"],
  grade: ["Hadith grade", "Grade", "Degree", "Authenticity", "درجة الحديث", "الدرجة", "Derecesi", "Derece", "Degré", "Derajat", "درجہ"],
  explanation: ["Explanation", "Commentary", "الشرح", "Açıklama", "Şerh", "Explication", "Penjelasan", "Syarah", "تشریح"],
  benefits: ["From the benefits of the hadith", "Benefits", "Lessons", "من فوائد الحديث", "الفوائد", "Faydaları", "Faydalar", "Enseignements", "Bienfaits", "Faedah", "Pelajaran", "فوائد"],
  source: ["Source", "Reference", "Takhrij", "المصدر", "التخريج", "Kaynak", "Sumber", "ماخذ"],
  translation: ["Translation", "الترجمة", "Tercüme", "Traduction", "Terjemahan", "ترجمہ"],
  hadith: ["Hadith text", "Hadith", "نص الحديث", "الحديث", "Hadis", "Hadits"],
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** كل الصيغ مرتبة من الأطول (فلا تسبق «Grade» «Hadith grade»). */
const ENTRIES: { key: LabelKey; alias: string }[] = LABEL_KEYS.flatMap((key) => ALIASES[key].map((alias) => ({ key, alias }))).sort(
  (a, b) => b.alias.length - a.alias.length,
);

const LINE_LABEL = new RegExp(`^([ \\t]*[*_#>•\\-]*[ \\t]*)(${ENTRIES.map((e) => escape(e.alias)).join("|")})([ \\t]*[*_]*[ \\t]*[:：])`, "gimu");

/** يستبدل تسميات الحقول في أول الأسطر بتسمياتها في لغة الواجهة (labels). */
export function localizeLabels(text: string, labels: Partial<Record<LabelKey, string>>): string {
  return text.replace(LINE_LABEL, (m, lead: string, found: string, colon: string) => {
    const entry = ENTRIES.find((e) => e.alias.toLowerCase() === found.toLowerCase());
    const label = entry ? labels[entry.key] : undefined;
    return label ? `${lead}${label}${colon.replace(/[*_]/g, "")}` : m;
  });
}
