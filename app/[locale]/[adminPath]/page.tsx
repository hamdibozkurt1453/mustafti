import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { PagePlaceholder } from "@/components/PagePlaceholder";

type Props = { params: Promise<{ locale: string; adminPath: string }> };

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * `/[ADMIN_PATH]` — لوحة المشرف (S10).
 * أي مسار لا يطابق متغير ADMIN_PATH يُعامل كصفحة غير موجودة.
 * تنبيه: الرابط السري وحده ليس حماية؛ الدخول + MFA + فحص الدور في الخادم تُضاف في S2 وS10.
 */
export default async function AdminPage({ params }: Props) {
  const { locale, adminPath } = await params;
  const secret = process.env.ADMIN_PATH;
  if (!secret || decodeURIComponent(adminPath) !== secret) notFound();
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout
  return <PagePlaceholder page="admin" />;
}
