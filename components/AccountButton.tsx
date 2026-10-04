"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * زر الرأس: «دخول» (/login) للزائر، و«حسابي» (/me) عند وجود جلسة.
 * يقرأ الجلسة في المتصفح ويتابع تغيّرها، فتبقى صفحات الموقع ثابتة (static)
 * ولا يحتاج الرأس إلى فحص الهوية في الخادم لكل طلب.
 */
export function AccountButton() {
  const t = useTranslations("nav");
  const [signedIn, setSignedIn] = useState(false);
  // الدخول والخروج يتمّان بـ Server Action ثم توجيه، فنعيد القراءة عند تغيّر الصفحة.
  const pathname = usePathname();

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session)));
    return () => data.subscription.unsubscribe();
  }, [pathname]);

  return (
    <Link
      href={signedIn ? "/me" : "/login"}
      className="rounded-full bg-gold-500 px-4 py-2 text-sm font-semibold text-green-900 transition hover:brightness-105"
    >
      {signedIn ? t("account") : t("login")}
    </Link>
  );
}
