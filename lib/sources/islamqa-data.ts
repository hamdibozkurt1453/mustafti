import { bestParagraphs, firstParagraph } from "@/lib/brain/excerpt";
import type { SourceResult } from "./types";

/**
 * «الإسلام سؤال وجواب» محلياً (R1d) — الجزء النقي: تحويل صفوف المجموعة العامة
 * kingkaung/islamqainfo_parallel_corpus (Hugging Face، CC BY-NC 4.0) إلى صفوف الجدول،
 * وصف نتيجة البحث إلى نتيجة بالواجهة الموحدة بمقتطف حرفي يقتطعه الكود.
 */

export const ISLAMQA_NAME = "الإسلام سؤال وجواب";
export const ISLAMQA_DATASET = "kingkaung/islamqainfo_parallel_corpus";
export const ISLAMQA_LICENSE = "CC BY-NC 4.0";
/** حد الجواب المحفوظ (العربية والإنجليزية). */
export const ANSWER_MAX = 8000;
/** لغات العنوان والسؤال والرابط فقط (بلا الجواب، توفيراً للمساحة). */
export const LINK_LANGS = ["tr", "fr", "id", "ur", "bn", "ru"] as const;
export const HF_PAGE = 100;

export function hfRowsUrl(offset: number, length = HF_PAGE): string {
  return `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(ISLAMQA_DATASET)}&config=default&split=train&offset=${Math.max(0, Math.floor(offset))}&length=${length}`;
}

export type IslamqaTableRow = Record<string, string | null> & { original_id: string };

const s = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t ? t : null;
};

/** يقطع النص عند حده (عند آخر مسافة قبله إن قربت)، بلا تغيير في الحروف. */
export function cutAt(text: string | null, max = ANSWER_MAX): string | null {
  if (!text || text.length <= max) return text;
  const space = text.lastIndexOf(" ", max);
  return text.slice(0, space > max * 0.9 ? space : max);
}

/** صف المجموعة ← صف الجدول (null إن لم يكن له original_id أو لا عربي ولا إنجليزي فيه). */
export function tableRowFromHf(row: Record<string, unknown>): IslamqaTableRow | null {
  const id = s(row.original_id);
  if (!id) return null;
  const out: IslamqaTableRow = { original_id: id, topic: s(row.topic) };
  for (const l of ["ar", "en"]) {
    out[`title_${l}`] = s(row[`title_${l}`]);
    out[`question_${l}`] = s(row[`question_${l}`]);
    out[`answer_${l}`] = cutAt(s(row[`answer_${l}`]));
    out[`link_${l}`] = s(row[`link_${l}`]);
  }
  for (const l of LINK_LANGS) {
    out[`title_${l}`] = s(row[`title_${l}`]);
    out[`question_${l}`] = s(row[`question_${l}`]);
    out[`link_${l}`] = s(row[`link_${l}`]);
  }
  if (!out.answer_ar && !out.answer_en) return null;
  return out;
}

/** رد datasets-server: {rows:[{row_idx, row}], num_rows_total}. */
export function parseHfPage(json: unknown): { rows: IslamqaTableRow[]; total: number | null; count: number } {
  const o = (json ?? {}) as { rows?: { row?: Record<string, unknown> }[]; num_rows_total?: unknown };
  const list = Array.isArray(o.rows) ? o.rows : [];
  const rows = list.map((r) => (r?.row ? tableRowFromHf(r.row) : null)).filter((r): r is IslamqaTableRow => r !== null);
  // المكرر في الدفعة نفسها يُسقط (upsert واحد لا يقبل المفتاح مرتين).
  const unique = [...new Map(rows.map((r) => [r.original_id, r])).values()];
  return { rows: unique, total: typeof o.num_rows_total === "number" ? o.num_rows_total : null, count: list.length };
}

/** صف search_islamqa. */
export type IslamqaHit = {
  original_id: string;
  topic: string | null;
  title_ar: string | null;
  question_ar: string | null;
  answer_ar: string | null;
  link_ar: string | null;
  title_en: string | null;
  question_en: string | null;
  answer_en: string | null;
  link_en: string | null;
  titles: Record<string, string> | null;
  links: Record<string, string> | null;
  score: number;
};

const SAFE_LINK = /^https:\/\/(?:[a-z0-9-]+\.)*islamqa\.info\//i;

/** رابط الفتوى بلغة السائل إن وُجد، وإلا العربي، وإلا الإنجليزي (من islamqa.info وحده). */
export function islamqaLink(hit: IslamqaHit, lang: string): string {
  const local = lang === "ar" ? hit.link_ar : lang === "en" ? hit.link_en : hit.links?.[lang];
  for (const u of [local, hit.link_ar, hit.link_en]) if (u && SAFE_LINK.test(u.trim())) return u.trim();
  return `https://islamqa.info/ar/answers/${encodeURIComponent(hit.original_id)}`;
}

const QUESTION_CHARS = 500;

/**
 * نتيجة بحث ← نتيجة بالواجهة الموحدة. للإنجليزي النص الإنجليزي إن وُجد، ولغيره العربي.
 * المقتطف من الجواب حرفياً: أقرب فقرة (أو فقرتين) لكلمات السؤال يقتطعها الكود، وإلا أول فقرة.
 */
export function islamqaResult(hit: IslamqaHit, lang: string, terms: string[]): SourceResult | null {
  const en = lang === "en" && Boolean(hit.answer_en);
  const answer = (en ? hit.answer_en : hit.answer_ar) ?? hit.answer_en ?? "";
  if (!answer.trim()) return null;
  const title = (lang !== "ar" && lang !== "en" ? hit.titles?.[lang] : null) ?? (en ? hit.title_en : hit.title_ar) ?? hit.title_ar ?? hit.title_en ?? ISLAMQA_NAME;
  const question = ((en ? hit.question_en : hit.question_ar) ?? "").trim();
  const excerpt = bestParagraphs(answer, terms)?.text ?? firstParagraph(answer);
  if (!excerpt) return null;
  const q = question.length > QUESTION_CHARS ? `${question.slice(0, QUESTION_CHARS)}…` : question;
  return {
    title,
    text: [q && q !== title ? q : "", excerpt].filter(Boolean).join("\n"),
    url: islamqaLink(hit, lang),
    source: ISLAMQA_NAME,
    sourceId: "islamqa",
    lang: en ? "en" : "ar",
    ref: `islamqa:${hit.original_id}`,
    fatwa: { mufti: ISLAMQA_NAME, question: q || title, answer: excerpt, host: "islamqa.info", ...(hit.topic ? { category: hit.topic } : {}) },
  };
}
