import { isEnabledHref } from "@/lib/config";

/** روابط الرأس والقائمة (القسم 1.3). المفاتيح في messages/*.json تحت "nav". */
const allNavItems = [
  { href: "/", key: "home" },
  { href: "/prayer", key: "prayer" },
  { href: "/adhkar", key: "adhkar" },
  { href: "/new-muslim", key: "newMuslim" },
  { href: "/about", key: "about" },
] as const;

/** الروابط الظاهرة بعد مفاتيح الميزات (lib/config). */
export const navItems = allNavItems.filter((item) => isEnabledHref(item.href));
