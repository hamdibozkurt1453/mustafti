"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { DORAR_API, dorarResultHtml, filterDorar, parseDorarHtml, type DorarHadith } from "@/lib/sources/dorar-parse";

/**
 * بطاقة «الدرر السنية» لسؤال التحقق من حديث (R1b). موقع الدرر يحجب خادمنا (403)، فيطلبها متصفح
 * السائل مباشرة بـ JSONP (dorar_api.json?skey=…&callback=…). النص والمحدث والمصدر و«خلاصة حكم
 * المحدث» حرفياً كما في الموقع، مع رابط صفحة البحث. لا تمر بالنموذج ولا بالخادم، وتختفي إن فشل
 * الطلب أو تأخر أو لم يعد شيئاً. تُعرض فقط النتائج التي تشبه الحديث المسؤول عنه (كلمات مشتركة ≥ 50%،
 * حتى 3)، وإلا أول نتيجتين بعنوان «أقرب ما وجدناه».
 */

const TIMEOUT_MS = 10_000;
/** نتائج كثيرة تُحلَّل ثم تُرشَّح بالتشابه مع الحديث المسؤول عنه. */
const PARSE_MAX = 15;

/** طلب JSONP واحد: يحمّل السكربت ويستدعي دالة عامة باسم فريد، ثم ينظّف. */
function jsonp(url: string, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const name = `mustaftiDorar_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const script = document.createElement("script");
    const w = window as unknown as Record<string, unknown>;
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("dorar: timeout"));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      delete w[name];
      script.remove();
    };
    w[name] = (data: unknown) => {
      cleanup();
      resolve(data);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error("dorar: load failed"));
    };
    script.src = `${url}${url.includes("?") ? "&" : "?"}callback=${name}`;
    script.async = true;
    script.referrerPolicy = "no-referrer";
    document.head.appendChild(script);
  });
}

export function DorarCard({ query, onResult }: { query: string; onResult?: (count: number) => void }) {
  const t = useTranslations("chat");
  const [found, setFound] = useState<{ items: DorarHadith[]; closest: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    jsonp(`${DORAR_API}?skey=${encodeURIComponent(query)}`, TIMEOUT_MS)
      .then((data) => {
        if (!alive) return;
        const result = filterDorar(parseDorarHtml(dorarResultHtml(data), query, PARSE_MAX), query);
        setFound(result);
        onResult?.(result.items.length);
      })
      .catch(() => {
        if (!alive) return;
        setFound({ items: [], closest: false });
        onResult?.(0);
      });
    return () => {
      alive = false;
    };
    // onResult من الأب يتغير كل رسم؛ الطلب مرة واحدة لكل عبارة.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const hadiths = found?.items;
  if (!hadiths?.length) return null;
  const title = found!.closest ? t("dorarClosest") : t("dorarTitle");
  return (
    <section aria-label={title} className="mf-rise">
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-green-600">{title}</h3>
      <ol className="grid gap-2.5">
        {hadiths.map((h) => (
          <li key={h.url} className="rounded-[20px] border border-sand-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-gold-50 px-2.5 py-0.5 text-[11px] font-semibold text-green-900 ring-1 ring-gold-500/50">
                {t("badgeQuoted")}
              </span>
              <span className="rounded-full bg-green-600/10 px-2.5 py-0.5 text-[11px] font-semibold text-green-600">
                {t("dorarGrade")}: <bdi dir="rtl">{h.grade}</bdi>
              </span>
            </div>
            <blockquote dir="rtl" lang="ar" className="mt-2 whitespace-pre-wrap border-s-2 border-gold-500 ps-3 text-[15px] leading-relaxed text-green-900">
              {h.text}
            </blockquote>
            <dl className="mt-2 grid gap-0.5 text-xs text-ink-600">
              {h.muhaddith && (
                <div>
                  <dt className="inline font-semibold">{t("dorarMuhaddith")}: </dt>
                  <dd className="inline" dir="rtl">
                    {h.muhaddith}
                  </dd>
                </div>
              )}
              {(h.book || h.page) && (
                <div>
                  <dt className="inline font-semibold">{t("dorarSource")}: </dt>
                  <dd className="inline" dir="rtl">
                    {[h.book, h.page].filter(Boolean).join(" — ")}
                  </dd>
                </div>
              )}
            </dl>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-sand-200 pt-3 text-xs">
              <span className="text-ink-600">{t("dorarNote")}</span>
              <a
                href={h.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-green-900 px-3 py-1.5 font-semibold text-ivory-50 transition hover:bg-green-600"
              >
                {t("viewSource")}
                <span aria-hidden>↗</span>
              </a>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
