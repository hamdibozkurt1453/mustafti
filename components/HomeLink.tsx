"use client";

import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { requestHome } from "@/lib/ui-store";

/**
 * رابط الشعار (F1): رابط حقيقي إلى /[locale] يعمل بلا JavaScript، ومعه طلب «الرئيسية» حتى تعود
 * الواجهة الأولى ولو كان السائل داخل المحادثة في الرئيسية نفسها (الرابط إلى الصفحة نفسها لا ينتقل).
 */
export function HomeLink({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <Link href="/" aria-label={label} className={className} onClick={() => requestHome()}>
      {children}
    </Link>
  );
}
