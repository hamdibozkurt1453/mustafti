/**
 * نص قرآني للعرض (F1): نص MCP بالرسم العثماني فيه رموز لا تدعمها خطوط الهاتف فتظهر مربعات (☒).
 * الخط Amiri Quran (class quran-text) يغطي الرسم العثماني، وهذه الدالة احتياط فوقه: تزيل علامات الوقف
 * وكل رمز خارج الحروف والتشكيل والعلامات العثمانية التي يغطيها الخط. للعرض فقط، بعد الحارس.
 */

/** علامات الوقف والرموز الزخرفية: صلي، قلي، م، لا، ج، ∴، ۛ، ۞، ۩ (U+06D6–06DC و06DE و06E9). */
const PAUSE_MARKS = /[ۖ-ۜ۞۩]/g;

/**
 * المسموح بعد التنظيف: الحروف العربية الأساسية، والتشكيل الذي يغطيه الخط، والألف الخنجرية وألف الوصل،
 * والعلامات العثمانية الصغيرة (U+06DF–06E8 و06EA–06ED)، والتنوين المتتابع (U+08F0–08F2)، والتطويل،
 * والأرقام ورقم الآية ۝ وقوسا الآية، والمسافات، وعلامات الترقيم البسيطة.
 */
const ALLOWED =
  /[ء-غـ-ٜ٘٠-٩ٰٱ۝۟-۪ۨ-ࣰۭ-ࣲ﴾﴿0-9\s().,:؛،]/u;

/** يزيل علامات الوقف والرموز غير المدعومة، ويوحّد المسافات. */
export function cleanQuranText(text: string): string {
  let out = "";
  for (const ch of text.replace(PAUSE_MARKS, "")) if (ALLOWED.test(ch)) out += ch;
  return out.replace(/[ \t ]{2,}/g, " ").replace(/ +([،؛.:)])/g, "$1").trim();
}

/** أجزاء النص: ما بين ﴿ ﴾ آية (quran: true) تُعرض بخط المصحف بعد التنظيف، وغيره كما هو. */
export function splitQuranSpans(text: string): { text: string; quran: boolean }[] {
  const parts: { text: string; quran: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(/﴿([^﴾\n]{1,2000})﴾/g)) {
    if (m.index! > last) parts.push({ text: text.slice(last, m.index), quran: false });
    parts.push({ text: `﴿${cleanQuranText(m[1])}﴾`, quran: true });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), quran: false });
  return parts;
}
