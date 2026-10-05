"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { navItems } from "./nav-items";

type Props = {
  variant: "desktop" | "mobile";
  onNavigate?: () => void;
};

/** روابط التنقل الرئيسية مع تمييز الصفحة الحالية. */
export function NavLinks({ variant, onNavigate }: Props) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <ul className={variant === "desktop" ? "flex items-center gap-0.5 whitespace-nowrap" : "flex flex-col gap-1"}>
      {navItems.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={
                variant === "desktop"
                  ? `mf-navlink relative rounded-full px-3 py-1.5 text-sm transition-colors duration-300 ${
                      active ? "bg-ivory-50/10 text-gold-500" : "text-ivory-50/85 hover:bg-ivory-50/[0.06] hover:text-ivory-50"
                    }`
                  : `block rounded-xl px-4 py-3 text-base transition-colors ${
                      active ? "bg-ivory-50/10 text-gold-500" : "text-ivory-50 hover:bg-ivory-50/5"
                    }`
              }
            >
              {t(item.key)}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
