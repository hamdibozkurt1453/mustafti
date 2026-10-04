"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";
import { useChatMode } from "@/lib/ui-store";

/**
 * غلاف الرأس: في الصفحة الرئيسية يطفو شفافاً فوق الواجهة الأولى، ويصير أخضر
 * بزجاج ضبابي عند التمرير أو في وضع المحادثة. وفي باقي الصفحات ثابت داكن.
 */
export function HeaderShell({ children }: { children: ReactNode }) {
  const isHome = usePathname() === "/";
  const chat = useChatMode();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const solid = !isHome || scrolled || chat;

  return (
    <header
      className={`${isHome ? "fixed" : "sticky"} inset-x-0 top-0 z-40 text-ivory-50 transition-[background-color,box-shadow,backdrop-filter] duration-500 ${
        solid
          ? "bg-green-900/95 shadow-[0_1px_0_rgb(245_243_234/0.08)] backdrop-blur-xl backdrop-saturate-150"
          : "bg-transparent"
      }`}
    >
      {children}
    </header>
  );
}
