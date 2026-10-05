/**
 * مفاتيح الميزات (ثابتة في الكود، لا متغيرات بيئة: تُقرأ في الخادم والمتصفح بالقيمة نفسها).
 *
 * FEATURE_EXTRAS: «المسلم الجديد»، وبطاقتا المواقيت والأذكار في الرئيسية.
 * مُفعّل (S6، قرار: لا نحذف أي ميزة من الخطة). إطفاؤه (false) يخفي رابط «المسلم الجديد» من الرأس
 * وقائمة الهاتف والتذييل، وبطاقتي المواقيت والأذكار من الرئيسية، ويجعل /new-muslim تعيد 404.
 * (R2: ‎/prayer و‎/adhkar صارا تحويلاً إلى الرئيسية في next.config.ts، وبطاقتاهما فيها.)
 */
export const FEATURE_EXTRAS: boolean = true;

/** المسارات التي يحكمها FEATURE_EXTRAS. */
export const EXTRAS_PATHS = ["/new-muslim"] as const;

/** هل الرابط ظاهر حسب مفاتيح الميزات؟ */
export function isEnabledHref(href: string): boolean {
  return FEATURE_EXTRAS || !(EXTRAS_PATHS as readonly string[]).includes(href);
}
