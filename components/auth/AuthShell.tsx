import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { GeometricPattern } from "@/components/home/GeometricPattern";
import { getDirection } from "@/i18n/locales";

/**
 * F2: إطار صفحات الحساب (الدخول، والتسجيل، وإعادة التعيين): بطاقة من جزأين.
 * جانب الهوية: خلفية خضراء بالنقش الهندسي نفسه في الواجهة الأولى بحركة خفيفة جداً (mf-drift، تتوقف مع
 * prefers-reduced-motion)، والشعار، و«السلام عليكم» وسطر عن المنصة. وجانب النموذج على العاجي.
 * جانب الهوية أول عمود في الشبكة، فيكون يميناً في RTL ويساراً في LTR تلقائياً. على الهاتف شريط علوي قصير.
 */
export async function AuthShell({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  const t = await getTranslations("auth");
  const rtl = getDirection(await getLocale()) === "rtl";

  return (
    <main className="relative flex flex-1 items-center justify-center bg-ivory-50 px-4 py-8 sm:py-14">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-[var(--radius-mf)] border border-sand-200 bg-ivory-50 shadow-[0_30px_70px_-35px_rgb(4_48_31/0.55)] md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <aside
          data-testid="auth-brand"
          className="relative isolate flex items-center gap-4 overflow-hidden bg-green-900 px-6 py-5 text-ivory-50 md:flex-col md:items-start md:justify-between md:gap-10 md:p-10"
        >
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-40 [mask-image:radial-gradient(ellipse_90%_80%_at_50%_40%,#000_35%,transparent_100%)]">
            <GeometricPattern className="mf-drift h-full w-full" />
          </div>
          <div
            aria-hidden
            className="absolute inset-0 -z-10"
            style={{ background: "radial-gradient(70% 60% at 80% 0%, rgb(10 107 69 / 0.75), transparent 70%), radial-gradient(60% 50% at 10% 100%, rgb(255 184 0 / 0.12), transparent 70%)" }}
          />
          {rtl ? (
            <Image src="/brand/logo-ar-on-dark.svg" alt="مُستفتي" width={3918} height={1380} className="h-9 w-auto flex-none md:h-12" />
          ) : (
            <Image src="/brand/logo-en-on-dark.svg" alt="Mustafti" width={4338} height={910} className="h-6 w-auto flex-none md:h-8" />
          )}
          <div className="min-w-0">
            <p className="font-display text-xl font-semibold leading-tight md:text-[38px]">{t("brandGreeting")}</p>
            <p className="mt-1 hidden text-ivory-50/80 sm:block md:mt-3 md:text-[17px] md:leading-relaxed">{t("brandLine")}</p>
          </div>
        </aside>

        <div className="p-6 sm:p-10">
          <h1 className="font-display text-[28px] font-bold leading-snug text-green-900 sm:text-[32px]">{title}</h1>
          {lead && <p className="mt-2 text-ink-600">{lead}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
