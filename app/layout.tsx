import type { ReactNode } from "react";

/**
 * التخطيط الجذري يمرّر المحتوى فقط؛ وسم <html> مع lang وdir في app/[locale]/layout.tsx.
 * وجوده مطلوب لأن app/not-found.tsx في الجذر.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
