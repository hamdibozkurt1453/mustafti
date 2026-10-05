"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { signOut } from "@/lib/auth/actions";
import { getAccountMenu, type AccountMenu } from "@/lib/experts/menu";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/** شارة عدد حمراء (إشعار داخل الموقع). */
export function CountBadge({ count, label }: { count: number; label?: string }) {
  if (!count) return null;
  return (
    <span
      aria-label={label}
      className="inline-flex min-w-5 items-center justify-center rounded-full bg-alert-600 px-1.5 text-[11px] font-bold leading-5 text-ivory-50"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * زر الرأس: «دخول» (/login) للزائر، و«حسابي» عند وجود جلسة.
 * يقرأ الجلسة في المتصفح ويتابع تغيّرها، فتبقى صفحات الموقع ثابتة (static).
 * القائمة وأعدادها (طلبات المختصين، والملفات المتاحة) من الخادم عبر getAccountMenu عند كل تحميل للصفحة.
 */
export function AccountButton() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const [signedIn, setSignedIn] = useState(false);
  const [menu, setMenu] = useState<AccountMenu | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // الدخول والخروج يتمّان بـ Server Action ثم توجيه، فنعيد القراءة عند تغيّر الصفحة.
  const pathname = usePathname();

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session)));
    return () => data.subscription.unsubscribe();
  }, [pathname]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- إغلاق القائمة عند الانتقال
    setOpen(false);
    if (!signedIn) {
      setMenu(null);
      return;
    }
    let live = true;
    getAccountMenu()
      .then((m) => live && setMenu(m))
      .catch(() => live && setMenu(null));
    return () => {
      live = false;
    };
  }, [signedIn, pathname]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const buttonClass =
    "mf-press inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-gold-500 px-3.5 py-2 text-sm font-semibold text-green-900 transition hover:brightness-105 sm:px-4";

  if (!signedIn) {
    return (
      <Link href="/login" className={buttonClass}>
        {t("login")}
      </Link>
    );
  }

  const items = menu?.items ?? [];
  const total = menu?.total ?? 0;

  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={buttonClass}>
        {t("account")}
        <CountBadge count={total} label={t("notifications", { count: total })} />
      </button>
      {open && (
        <ul
          role="menu"
          className="mf-drop absolute end-0 top-full z-50 mt-2 min-w-56 overflow-hidden rounded-2xl border border-sand-200 bg-ivory-50 py-1 text-green-900 shadow-[0_24px_60px_-30px_rgb(4_48_31/0.6)]"
        >
          <li role="none">
            <Link role="menuitem" href="/me" className="block px-4 py-2.5 text-sm font-semibold hover:bg-green-900/5">
              {t("account")}
            </Link>
          </li>
          {items.map((item) => (
            <li role="none" key={item.key}>
              <Link
                role="menuitem"
                href={item.href}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm font-semibold hover:bg-green-900/5"
              >
                {t(`accountMenu.${item.key}`)}
                <CountBadge count={item.count ?? 0} />
              </Link>
            </li>
          ))}
          <li role="none" className="mt-1 border-t border-sand-200 pt-1">
            <form action={signOut}>
              <input type="hidden" name="locale" value={locale} />
              <button role="menuitem" type="submit" className="block w-full px-4 py-2.5 text-start text-sm font-semibold text-ink-600 hover:bg-green-900/5">
                {t("signOut")}
              </button>
            </form>
          </li>
        </ul>
      )}
    </div>
  );
}
