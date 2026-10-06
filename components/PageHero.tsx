import type { ReactNode } from "react";
import { GeometricPattern } from "@/components/home/GeometricPattern";

/** F5: عرض المحتوى تحت الهيرو في الصفحات الداخلية. */
export const PAGE_WIDTH = "mx-auto w-full max-w-[1200px] px-4";

/**
 * F5: هيرو الصفحات الداخلية بعرض الشاشة الكامل، بالنقش الهندسي الذهبي نفسه في /about،
 * ومحتواه داخل عرض 1200px. الرئيسية لها هيروها الخاص.
 */
export function PageHero({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className="relative isolate overflow-hidden bg-green-900 text-ivory-50">
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{ background: "radial-gradient(90% 70% at 50% -10%, rgb(10 107 69 / 0.8), transparent 65%), radial-gradient(60% 50% at 50% 120%, rgb(255 184 0 / 0.14), transparent 70%)" }}
      />
      <div aria-hidden className="absolute inset-0 -z-10 opacity-60 [mask-image:radial-gradient(ellipse_75%_80%_at_50%_30%,#000_20%,transparent_80%)]">
        <GeometricPattern className="h-full w-full" />
      </div>
      <div className={`mf-stagger ${PAGE_WIDTH} pb-14 pt-12 sm:pb-20 sm:pt-16 ${className}`}>{children}</div>
    </section>
  );
}
