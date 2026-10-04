import Link from "next/link";
import "./globals.css";

/** صفحة 404 لما يقع خارج مسارات اللغات. */
export default function GlobalNotFound() {
  return (
    <html lang="ar" dir="rtl">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4 text-center">
        <h1 className="text-2xl font-bold">الصفحة غير موجودة</h1>
        <Link href="/ar" className="text-green-600 underline">
          العودة إلى مُستفتي
        </Link>
      </body>
    </html>
  );
}
