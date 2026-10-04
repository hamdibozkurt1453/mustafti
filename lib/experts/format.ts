import { PILLARS } from "@/lib/case/pillars";

/**
 * عرض بيانات الملف عند المختص (نقي، يُختبر محلياً): الباب بالعربية دائماً، واسم اللغة لا رمزها،
 * والتاريخ بأرقام لاتينية وبتوقيت المنصة (الرياض، الخطة: «كل الأوقات بتوقيت الرياض»).
 */

export const OTHER_CHAPTER_AR = "أخرى";
export const PLATFORM_TIME_ZONE = "Asia/Riyadh";

/** الأبواب الأربعة عشر من content/pillars.json بأسمائها العربية، ثم «أخرى». */
export function chapterOptionsAr(): { value: string; label: string }[] {
  return [
    ...Object.entries(PILLARS.chapters).map(([value, c]) => ({ value, label: c.ar })),
    { value: "other", label: OTHER_CHAPTER_AR },
  ];
}

/** اسم الباب بالعربية، و«أخرى» لما سواها. */
export function chapterAr(chapter: string | null | undefined): string {
  const c = chapter && chapter in PILLARS.chapters ? PILLARS.chapters[chapter as keyof typeof PILLARS.chapters] : null;
  return c ? c.ar : OTHER_CHAPTER_AR;
}

/** اسم اللغة بلغة الواجهة («ar» ← «العربية»)، أو الرمز إن تعذّر. */
export function languageName(code: string | null | undefined, uiLocale: string): string {
  const lang = (code || "ar").trim();
  try {
    return new Intl.DisplayNames([uiLocale], { type: "language" }).of(lang) ?? lang;
  } catch {
    return lang;
  }
}

/** «4 أكتوبر، 3:25 م» بأرقام لاتينية وبتوقيت المنصة. */
export function shortDateTime(iso: string, uiLocale: string): string {
  const date = new Date(iso);
  const locale = `${uiLocale}-u-nu-latn`;
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: PLATFORM_TIME_ZONE }).format(date);
  const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: PLATFORM_TIME_ZONE }).format(date);
  return `${day}${uiLocale === "ar" || uiLocale === "ur" || uiLocale === "fa" ? "، " : ", "}${time}`;
}
