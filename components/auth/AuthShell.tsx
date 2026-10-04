import type { ReactNode } from "react";

/** إطار صفحات الحساب: بطاقة عاجية على شريط أخضر عميق بهوية مستفتي. */
export function AuthShell({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <main className="relative flex flex-1 justify-center px-4 py-10 sm:py-16">
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-56 bg-green-900" />
      <div className="w-full max-w-md rounded-[var(--radius-mf)] border border-sand-200 bg-ivory-50 p-6 shadow-[0_24px_60px_-30px_rgb(4_48_31/0.45)] sm:p-8">
        <h1 className="font-display text-[28px] font-bold leading-snug text-green-900 sm:text-[32px]">{title}</h1>
        {lead && <p className="mt-2 text-ink-600">{lead}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
