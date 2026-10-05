/**
 * مفاتيح الميزات (ثابتة في الكود، لا متغيرات بيئة: تُقرأ في الخادم والمتصفح بالقيمة نفسها).
 *
 * FEATURE_EXTRAS: «المواقيت» و«الأذكار» و«المسلم الجديد».
 * مُفعّل (S6، قرار: لا نحذف أي ميزة من الخطة). إطفاؤه (false) يخفي روابطها من الرأس وقائمة
 * الهاتف والتذييل، وبطاقة «الصلاة القادمة» من الرئيسية، ويجعل صفحاتها تعيد 404.
 */
export const FEATURE_EXTRAS: boolean = true;

/** المسارات التي يحكمها FEATURE_EXTRAS. */
export const EXTRAS_PATHS = ["/prayer", "/adhkar", "/new-muslim"] as const;

/** هل الرابط ظاهر حسب مفاتيح الميزات؟ */
export function isEnabledHref(href: string): boolean {
  return FEATURE_EXTRAS || !(EXTRAS_PATHS as readonly string[]).includes(href);
}
