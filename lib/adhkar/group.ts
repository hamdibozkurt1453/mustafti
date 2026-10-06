import { OCCASIONS, type DhikrRow, type Occasion } from "./rules";

/**
 * F2b: تحويل صفوف جدول adhkar إلى أذكار للعرض وتجميعها بالفئات (دوال صرفة للاختبار).
 */

/** ذكر للعرض: النص العربي، ومعناه بلغة الواجهة إن وُجد. */
export type Dhikr = {
  id: string;
  occasions: Occasion[];
  text: string;
  title: string | null;
  grade: string;
  count: number | null;
  url: string;
  /** بلغة الواجهة: ترجمة الحديث من الموسوعة (لغير العربية)، أو المعنى بالإنجليزية من البذرة. */
  meaning: string | null;
  meaningGrade: string | null;
  meaningUrl: string | null;
  explanation: string | null;
  /** F2: النطق، والمعنى بالإنجليزية، والتخريج (الكتاب ورقم الحديث). */
  transliteration: string | null;
  meaningEn: string | null;
  reference: string | null;
};

/** الصفوف العربية أصل، وترجمة لغة الواجهة (إن وُجدت) فوقها، بترتيب position. */
export function toDhikrs(rows: DhikrRow[], locale: string): Dhikr[] {
  const local = new Map(rows.filter((r) => r.lang === locale && locale !== "ar").map((r) => [r.hadith_id, r]));
  return rows
    .filter((r) => r.lang === "ar")
    .sort((a, b) => a.position - b.position)
    .map((ar) => {
      const tr = local.get(ar.hadith_id);
      return {
        id: ar.hadith_id,
        occasions: (ar.occasions ?? []).filter((o): o is Occasion => (OCCASIONS as readonly string[]).includes(o)),
        text: ar.text,
        title: tr?.title ?? ar.title,
        grade: ar.grade,
        count: ar.repeat_count,
        url: ar.source_url,
        meaning: tr ? tr.text : locale !== "ar" ? (ar.meaning_en ?? null) : null,
        meaningGrade: tr?.grade ?? null,
        meaningUrl: tr?.source_url ?? null,
        explanation: tr ? tr.explanation : ar.explanation,
        transliteration: ar.transliteration ?? null,
        meaningEn: ar.meaning_en ?? null,
        reference: ar.reference ?? null,
      };
    });
}

/** الأذكار مجمّعة بالفئات الست (الذكر في أكثر من فئة يظهر في كل فئاته). */
export function groupAdhkar(items: Dhikr[]): Record<Occasion, Dhikr[]> {
  const out = Object.fromEntries(OCCASIONS.map((o) => [o, [] as Dhikr[]])) as Record<Occasion, Dhikr[]>;
  for (const d of items) for (const o of d.occasions) out[o].push(d);
  return out;
}
