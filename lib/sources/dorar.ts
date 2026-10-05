import "server-only";

import { cached, DAY } from "@/lib/cache";
import { clip } from "./html";
import { DORAR_API, DORAR_NAME, dorarResultHtml, HADITH_DIV, parseDorarHtml, type DorarHadith } from "./dorar-parse";
import { politeJson } from "./polite-fetch";
import type { SourceResult } from "./types";

/**
 * الدرر السنية — الموسوعة الحديثية من الخادم: لصفحة الفحص فقط (R1b). الموقع يحجب خادمنا بـ 403،
 * فالتحقق من الحديث في المحادثة يجري من متصفح السائل (components/chat/DorarCard.tsx). الواجهة:
 *   GET https://dorar.net/dorar_api.json?skey={q}  ←  { ahadith: { result: "<html>" } }
 * لكل حديث في الـ HTML: النص، والراوي، والمحدث، والمصدر، والصفحة أو الرقم، و«خلاصة حكم المحدث».
 * يُحلَّل إلى حقول، ويُحفظ الحكم حرفياً كما كتبه الموقع، ولا يُقبل حديث بلا حكم (لا حديث بلا درجة).
 * الرابط صفحة البحث في الموقع: https://dorar.net/hadith/search?q={q} (صفحات الموقع غير الواجهة رابط فقط).
 * يُستعمل للتحقق من الأحاديث («هل هذا حديث صحيح؟») ولإظهار الدرجة.
 */

/** الطلب بلا ذاكرة (لصفحة الفحص): الأحاديث المحللة، وعدد كتل الحديث في الـ HTML الخام. */
export async function fetchDorar(query: string): Promise<{ hadiths: DorarHadith[]; rawBlocks: number; htmlChars: number }> {
  const q = query.trim().slice(0, 150);
  const html = dorarResultHtml(await politeJson(`${DORAR_API}?skey=${encodeURIComponent(q)}`));
  return { hadiths: parseDorarHtml(html, q), rawBlocks: [...html.matchAll(HADITH_DIV)].length, htmlChars: html.length };
}

export function searchDorar(query: string): Promise<DorarHadith[]> {
  const q = query.trim().slice(0, 150);
  if (!q) return Promise.resolve([]);
  return cached(`dorar:${q}`, DAY, async () => (await fetchDorar(q)).hadiths);
}

/** الحديث بالواجهة الموحدة: النص، ثم سطر المصدر والحكم حرفياً. */
export function dorarResult(h: DorarHadith): SourceResult {
  const ref = [h.muhaddith, h.book, h.page].filter(Boolean).join("، ");
  const info = [
    h.rawi ? `الراوي: ${h.rawi}` : "",
    h.muhaddith ? `المحدث: ${h.muhaddith}` : "",
    h.book ? `المصدر: ${h.book}` : "",
    h.page ? `الصفحة أو الرقم: ${h.page}` : "",
    `خلاصة حكم المحدث: ${h.grade}`,
  ]
    .filter(Boolean)
    .join(" | ");
  return {
    title: clip(h.text, 110),
    text: `${h.text}\n${info}`,
    url: h.url,
    source: ref ? `${DORAR_NAME} (${ref})` : DORAR_NAME,
    sourceId: "dorar_hadith",
    grade: h.grade,
    lang: "ar",
  };
}

export { DORAR_API, DORAR_NAME, dorarResultHtml, parseDorarHtml, type DorarHadith } from "./dorar-parse";
