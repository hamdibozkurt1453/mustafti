"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { CloseIcon } from "@/components/icons";
import { Link, usePathname } from "@/i18n/navigation";
import { GUEST_NOTICE_KEY, guestLoginHref, showGuestNotice } from "@/lib/chat/guest-notice";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * F1: شريط صغير فوق المحادثة للزائر غير المسجّل: محادثته لا تُحفظ في حساب، مع زر دخول يعيده إلى الصفحة نفسها.
 * يُغلق بزر ×، ويبقى مغلقاً حتى نهاية الجلسة (sessionStorage، والصفحة تعمل بدونه).
 */
export function GuestNotice() {
  const t = useTranslations("chat.guest");
  const locale = useLocale();
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- القراءة بعد التحميل فقط
      if (window.sessionStorage.getItem(GUEST_NOTICE_KEY)) setDismissed(true);
    } catch {
      /* التخزين غير متاح: يظهر الشريط */
    }
    if (!isSupabaseConfigured()) return setSignedIn(false);
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session)));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!showGuestNotice(signedIn, dismissed)) return null;

  function close() {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(GUEST_NOTICE_KEY, "1");
    } catch {
      /* لا شيء */
    }
  }

  return (
    <div
      role="status"
      data-testid="guest-notice"
      className="mb-5 flex items-center gap-3 rounded-2xl border border-gold-500/50 bg-gold-50 px-4 py-2.5 text-sm text-green-900"
    >
      <p className="min-w-0 flex-1 leading-relaxed">{t("text")}</p>
      <Link
        href={guestLoginHref(`/${locale}${pathname === "/" ? "" : pathname}`)}
        className="mf-press flex-none rounded-full bg-green-900 px-3.5 py-1.5 text-xs font-semibold text-ivory-50 hover:bg-green-600"
      >
        {t("login")}
      </Link>
      <button
        type="button"
        onClick={close}
        aria-label={t("close")}
        className="flex-none rounded-full p-1 text-ink-600 transition hover:bg-green-900/5 hover:text-green-900"
      >
        <CloseIcon className="size-4" />
      </button>
    </div>
  );
}
