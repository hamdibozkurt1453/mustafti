"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * F3: ظهور متدرج خفيف عند دخول القسم الشاشة (IntersectionObserver، بلا مكتبة).
 * يحترم «تقليل الحركة» (motion-reduce)، ويظهر المحتوى كاملاً إن لم يدعم المتصفح المراقب.
 */
export function InView({ children, className = "", as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" }) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      data-shown={shown || undefined}
      className={`translate-y-6 opacity-0 transition duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] data-[shown]:translate-y-0 data-[shown]:opacity-100 motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none ${className}`}
    >
      {children}
    </Tag>
  );
}
