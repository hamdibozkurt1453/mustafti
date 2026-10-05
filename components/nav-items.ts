import { isEnabledHref } from "@/lib/config";

/**
 * روابط الرأس وقائمة ☰ بالترتيب نفسه (R2). المفاتيح في messages/*.json تحت "nav".
 * المواقيت والأذكار بطاقتان في الرئيسية، فلا رابط لهما هنا.
 */
const allNavItems = [
  { href: "/", key: "home" },
  { href: "/forum", key: "forum" },
  { href: "/new-muslim", key: "newMuslim" },
  { href: "/discover", key: "discover" },
  { href: "/library", key: "library" },
  { href: "/about", key: "about" },
] as const;

/** الروابط الظاهرة بعد مفاتيح الميزات (lib/config). */
export const navItems = allNavItems.filter((item) => isEnabledHref(item.href));
