"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

/** «انسخ رابط ملفي العام» وأزرار المشاركة (X، فيسبوك، واتساب، تلغرام): روابط مشاركة عادية بلا سكربتات خارجية. */
export function ShareProfile({ url, text }: { url: string; text: string }) {
  const t = useTranslations("experts.profile");
  const [copied, setCopied] = useState(false);
  const u = encodeURIComponent(url);
  const m = encodeURIComponent(text);
  const targets = [
    { key: "x", href: `https://twitter.com/intent/tweet?url=${u}&text=${m}` },
    { key: "facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { key: "whatsapp", href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}` },
    { key: "telegram", href: `https://t.me/share/url?url=${u}&text=${m}` },
  ] as const;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t("copyLink"), url);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={copy} className="rounded-full bg-gold-500 px-5 py-2.5 text-sm font-semibold text-green-900">
          {copied ? t("copied") : t("copyLink")}
        </button>
        <code dir="ltr" className="break-all rounded-lg bg-white px-3 py-1.5 text-xs text-ink-600">
          {url}
        </code>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-600">{t("shareOn")}</span>
        {targets.map((s) => (
          <a
            key={s.key}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-green-900/20 bg-white px-3 py-1.5 text-sm font-semibold text-green-900 hover:bg-green-900/5"
          >
            {t(`share.${s.key}`)}
          </a>
        ))}
      </div>
    </div>
  );
}
