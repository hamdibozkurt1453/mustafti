"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import type { DemoRole } from "@/lib/demo/rules";

/**
 * F5: أزرار دخول تجريبي للجنة التحكيم — **للعرض فقط، وتُحذف بعد المسابقة**.
 * ثابتة على الجانب (يمين في RTL، ويسار في LTR)، ولا تُعرض إلا إن فعّلها الخادم
 * (DEMO_LOGIN=true مع DEMO_ACCOUNTS_PASSWORD). الدخول نفسه في POST /api/demo-login.
 */
const ICONS: Record<DemoRole, React.ReactNode> = {
  user: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" />,
  specialized: <path d="M3 8l9-4 9 4-9 4-9-4zM7 10v5c0 1.7 2.2 3 5 3s5-1.3 5-3v-5M21 8v5" />,
  admin: <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3zM9 12l2 2 4-4" />,
};
const ROLES: DemoRole[] = ["user", "specialized", "admin"];

export function DemoLogin() {
  const t = useTranslations("demo");
  const router = useRouter();
  const [busy, setBusy] = useState<DemoRole | null>(null);
  const [failed, setFailed] = useState(false);

  async function login(role: DemoRole) {
    setBusy(role);
    setFailed(false);
    const res = await fetch("/api/demo-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    }).catch(() => null);
    if (res?.ok) {
      // الكوكيز كُتبت في الاستجابة؛ ننتقل إلى «حسابي» ونعيد قراءة الصفحات الخادمية.
      router.push("/me");
      router.refresh();
      setBusy(null);
      return;
    }
    setBusy(null);
    setFailed(true);
  }

  return (
    <aside aria-label={t("label")} className="fixed start-2 top-1/2 z-40 flex w-16 -translate-y-1/2 flex-col items-center gap-1.5">
      <p className="rounded-md bg-green-900/85 px-1.5 py-1 text-center text-[10px] font-semibold leading-tight text-gold-500">{t("label")}</p>
      {ROLES.map((role) => (
        <button
          key={role}
          type="button"
          onClick={() => login(role)}
          disabled={busy !== null}
          title={t(role)}
          aria-label={t(role)}
          className="mf-press flex size-10 items-center justify-center rounded-full border border-gold-500/60 bg-green-900 text-gold-500 shadow-lg transition hover:bg-green-600 disabled:opacity-60"
        >
          <svg viewBox="0 0 24 24" className={`size-5 ${busy === role ? "animate-pulse" : ""}`} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {ICONS[role]}
          </svg>
        </button>
      ))}
      {failed && <p role="alert" className="rounded-md bg-alert-600 px-1.5 py-1 text-center text-[10px] font-semibold text-ivory-50">{t("failed")}</p>}
    </aside>
  );
}
