import { z } from "zod";
import { isValidVerse, surahMeta } from "./quran-index";

/**
 * مخطط خطة الإحالات وتعليماتها وتطبيعها (نقي، يُختبر محلياً). يستعمله planner.ts.
 * الخطة مواضع فقط: لا جواب ولا نص ديني من النموذج.
 */

export const PlanSchema = z.object({
  quran: z
    .array(
      z.object({
        surah: z.number().int(),
        ayah: z.number().int(),
        through: z.number().int().nullable(),
      }),
    ),
  // بلا حد أعلى في المخطط (فلا يُرفض رد طويل ويكلّف طلب تصحيح)؛ الحدود في normalizePlan.
  surah_info: z.array(z.number().int()),
  quran_index: z.boolean(),
  quran_queries: z.array(z.string()),
  hadith_queries: z.array(z.string()),
  bayyinat_queries: z.array(z.string()),
});

export type VersePlan = { surah: number; ayah: number; through?: number };

export type CitationPlan = {
  quran: VersePlan[];
  surahInfo: number[];
  /** السؤال عن المصحف جملةً (عدد السور، أولها وآخرها): نص «فهرس سور المصحف». */
  quranIndex: boolean;
  /** عبارات عربية قصيرة يُبحث بها في القرآن (search، sources=[quran]). */
  quranQueries: string[];
  hadithQueries: string[];
  bayyinatQueries: string[];
};

export const PLAN_LIMITS = { quran: 6, surahInfo: 3, quranQueries: 2, hadith: 3, bayyinat: 2, range: 10 } as const;

export const PLANNER_SYSTEM = `You locate evidence for an Islamic Q&A tool. You NEVER answer the question and NEVER write any Qur'an, hadith or religious text.
Output ONLY locations where the answer is explicitly stated in approved sources:
- quran: exact verses {surah, ayah, through} (through = last verse of a short range, or null). Only verses that directly state the answer.
- surah_info: surah numbers whose identity is asked about (e.g. "the third surah" → [3], "the first surah" → [1]).
- quran_index: true only if the question is about the Mushaf as a whole (number of surahs, first or last surah, total verses); else false.
- quran_queries: 1-2 SHORT Arabic phrases (2-4 words) that appear in the verse that states the answer, to search the Qur'an text (e.g. "يرفع إبراهيم القواعد"). Empty if no verse is needed.
- hadith_queries: 2-3 SHORT keyword queries (2-3 distinctive Arabic words each, no full sentences) for the specific authentic hadith that states the answer. The hadith search is exact full-text, so use rare words that appear in that hadith. Examples: "جبريل الإيمان الإحسان", "بني الإسلام خمس", "خاتم النبيين".
- bayyinat_queries: 0-2 short Arabic phrases (2-4 words) describing the doubt or topic, to search the book «بيّنات: أسئلة وأجوبة عن الإسلام» (e.g. "عبادة الكعبة", "انتشار الإسلام بالسيف"). Never give question numbers.
Give exact references where the answer is stated. If unsure, return fewer. Do not write the answer.
If the question asks for a personal ruling, or is not about Islam, return empty arrays and quran_index false.
Reply with JSON only: {"quran":[...],"surah_info":[...],"quran_index":false,"quran_queries":[...],"hadith_queries":[...],"bayyinat_queries":[...]}`;

/** رسالة إعادة التخطيط مرة واحدة: المواضع التي لم تبلغ الصلة، فلا تُقترح ثانية. */
export function replanNote(failed: string[]): string {
  return `The previous locations did NOT contain the answer (rejected after checking the source text): ${failed.join("; ")}.
Do not repeat them. Propose different, exact locations, or return fewer.`;
}

/** يطبّع الخطة: حدود السور والآيات (من فهرس المصحف)، ونطاق قصير، وإزالة المكرر، وحدود العدد. */
export function normalizePlan(raw: z.infer<typeof PlanSchema>): CitationPlan {
  const seen = new Set<string>();
  const quran: VersePlan[] = [];
  for (const v of raw.quran) {
    if (!isValidVerse(v.surah, v.ayah)) continue;
    const last = surahMeta(v.surah)!.verses;
    const through =
      v.through && v.through > v.ayah ? Math.min(v.through, v.ayah + PLAN_LIMITS.range - 1, last) : undefined;
    const key = `${v.surah}:${v.ayah}:${through ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    quran.push(through ? { surah: v.surah, ayah: v.ayah, through } : { surah: v.surah, ayah: v.ayah });
    if (quran.length >= PLAN_LIMITS.quran) break;
  }
  const uniq = <T>(xs: T[]) => [...new Set(xs)];
  const phrase = (s: string) => s.replace(/[«»"“”﴿﴾]/g, "").trim().slice(0, 80);
  const phrases = (xs: string[] | undefined, max: number) => uniq((xs ?? []).map(phrase).filter((q) => q.length >= 3)).slice(0, max);
  return {
    quran,
    surahInfo: uniq(raw.surah_info.filter((n) => n >= 1 && n <= 114)).slice(0, PLAN_LIMITS.surahInfo),
    quranIndex: Boolean(raw.quran_index),
    quranQueries: phrases(raw.quran_queries, PLAN_LIMITS.quranQueries),
    hadithQueries: phrases(raw.hadith_queries, PLAN_LIMITS.hadith),
    bayyinatQueries: phrases(raw.bayyinat_queries, PLAN_LIMITS.bayyinat),
  };
}

export function isEmptyPlan(p: CitationPlan | null): boolean {
  return (
    !p ||
    (!p.quran.length && !p.surahInfo.length && !p.quranIndex && !p.quranQueries.length && !p.hadithQueries.length && !p.bayyinatQueries.length)
  );
}
