/**
 * F1: شريط الزائر فوق المحادثة («محادثتك لا تُحفظ لأنك غير مسجّل…»). دالة صرفة للاختبار:
 * يظهر للزائر بعد التأكد من غياب الجلسة (null = لم تُقرأ بعد، فلا وميض للمسجّل)، وما لم يغلقه.
 */
export function showGuestNotice(signedIn: boolean | null, dismissed: boolean): boolean {
  return signedIn === false && !dismissed;
}

/** مفتاح الإغلاق في sessionStorage: يبقى مغلقاً حتى نهاية الجلسة في هذا التبويب. */
export const GUEST_NOTICE_KEY = "mustafti.guestNotice.dismissed";

/** وجهة زر الدخول: يعود السائل إلى الصفحة نفسها بعد الدخول. */
export function guestLoginHref(pathname: string): { pathname: "/login"; query: { next: string } } {
  return { pathname: "/login", query: { next: pathname } };
}
