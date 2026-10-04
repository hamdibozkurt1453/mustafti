/** روابط الرأس والقائمة (القسم 1.3). المفاتيح في messages/*.json تحت "nav". */
export const navItems = [
  { href: "/", key: "home" },
  { href: "/prayer", key: "prayer" },
  { href: "/adhkar", key: "adhkar" },
  { href: "/new-muslim", key: "newMuslim" },
  { href: "/about", key: "about" },
] as const;
