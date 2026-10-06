/** عناصر قائمة «حسابي» (خارج ملف "use server" لأنه لا يصدّر إلا دوالّ async). */
export type AccountMenuItem = {
  key: "conversations" | "expertDashboard" | "adminPanel";
  href: string;
  count?: number;
};

/** F5: «محادثاتي» أول عناصر القائمة لكل مسجّل (قبل «لوحة المختص»)، تفتح تبويبها في /me. */
export const CONVERSATIONS_ITEM: AccountMenuItem = { key: "conversations", href: "/me?tab=conversations" };
