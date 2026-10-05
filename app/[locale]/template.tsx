import type { ReactNode } from "react";

/**
 * انتقال ناعم بين الصفحات (R2): القالب يُعاد تركيبه عند كل تنقل، فتظهر الصفحة الجديدة بتلاشٍ وارتفاع خفيف
 * (‎.mf-page في globals.css، ويتوقف مع prefers-reduced-motion).
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="mf-page flex flex-1 flex-col">{children}</div>;
}
