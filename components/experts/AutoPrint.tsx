"use client";

import { useEffect } from "react";

/** يفتح نافذة الطباعة تلقائياً بعد تحميل الخط (والمتصفح يحفظها PDF). لا مكتبة PDF. */
export function AutoPrint() {
  useEffect(() => {
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      window.print();
    };
    const timer = setTimeout(run, 2500); // احتياط إن تأخر الخط
    document.fonts?.ready.then(() => setTimeout(run, 200)).catch(run);
    return () => clearTimeout(timer);
  }, []);
  return null;
}
