/**
 * مفاتيح الميزات (ثابتة في الكود، لا متغيرات بيئة: تُقرأ في الخادم والمتصفح بالقيمة نفسها).
 *
 * FEATURE_EXTRAS: «المواقيت» و«الأذكار» و«المسلم الجديد».
 * مطفأ مؤقتاً (S10): تختفي روابطها من الرأس وقائمة الهاتف والتذييل، وبطاقة «الصلاة القادمة»
 * من الرئيسية، وصفحاتها تعيد 404. الكود باقٍ كما هو، ويعود كله بتغيير القيمة إلى true.
 */
export const FEATURE_EXTRAS = false;

/** المسارات التي يحكمها FEATURE_EXTRAS. */
export const EXTRAS_PATHS = ["/prayer", "/adhkar", "/new-muslim"] as const;

/** هل الرابط ظاهر حسب مفاتيح الميزات؟ */
export function isEnabledHref(href: string): boolean {
  return FEATURE_EXTRAS || !(EXTRAS_PATHS as readonly string[]).includes(href);
}
