import "server-only";

import { createClient as createPublicClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DhikrRow, Occasion } from "./rules";

const COLUMNS = "hadith_id, lang, occasions, position, title, text, explanation, grade, repeat_count, source_url";
/** F2: أعمدة migration ‏20261014_adhkar_timed.sql (قبل تنفيذها تُقرأ الأعمدة الأولى وحدها). */
const F2_COLUMNS = `${COLUMNS}, transliteration, meaning_en, reference`;
/** بذرة الأذكار المشهورة بتخريجها (في الـ migration): لا يحذفها بناء أذكار الموسوعة. */
export const SEED_PREFIX = "seed-";

/** ذكر للعرض: النص العربي، ومعناه بلغة الواجهة إن وُجد في المصدر. */
export type Dhikr = {
  id: string;
  occasions: Occasion[];
  text: string;
  title: string | null;
  grade: string;
  count: number | null;
  url: string;
  /** بلغة الواجهة: ترجمة الحديث من الموسوعة (لغير العربية)، أو شرحه العربي من الموسوعة. */
  meaning: string | null;
  meaningGrade: string | null;
  meaningUrl: string | null;
  explanation: string | null;
  /** F2: النطق، والمعنى بالإنجليزية، والتخريج (الكتاب ورقم الحديث). */
  transliteration: string | null;
  meaningEn: string | null;
  reference: string | null;
};

/**
 * الأذكار للعرض (قراءة عامة بسياسة RLS). [] إن لم تُبنَ بعد أو لم يُعدّ Supabase.
 * بالمفتاح العام بلا كوكيز الجلسة، فتبقى الرئيسية ثابتة (ISR) ولا تُرسم لكل طلب.
 */
export async function listAdhkar(locale: string): Promise<Dhikr[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createPublicClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const langs = [...new Set(["ar", locale])];
    const query = (columns: string) => supabase.from("adhkar").select(columns).in("lang", langs).order("position");
    let { data, error } = await query(F2_COLUMNS);
    if (error) ({ data, error } = await query(COLUMNS));
    if (error || !data) return [];
    const rows = data as unknown as DhikrRow[];
    const local = new Map(rows.filter((r) => r.lang === locale && locale !== "ar").map((r) => [r.hadith_id, r]));
    return rows
      .filter((r) => r.lang === "ar")
      .map((ar) => {
        const tr = local.get(ar.hadith_id);
        return {
          id: ar.hadith_id,
          occasions: ar.occasions,
          text: ar.text,
          title: tr?.title ?? ar.title,
          grade: ar.grade,
          count: ar.repeat_count,
          url: ar.source_url,
          // لغير العربية: ترجمة الموسوعة إن وُجدت، وإلا المعنى بالإنجليزية من البذرة.
          meaning: tr ? tr.text : locale !== "ar" ? (ar.meaning_en ?? null) : null,
          meaningGrade: tr?.grade ?? null,
          meaningUrl: tr?.source_url ?? null,
          explanation: tr ? tr.explanation : ar.explanation,
          transliteration: ar.transliteration ?? null,
          meaningEn: ar.meaning_en ?? null,
          reference: ar.reference ?? null,
        };
      });
  } catch {
    return [];
  }
}

/** الصفوف العربية المحفوظة من الموسوعة (أساس بناء اللغات الأخرى؛ البذرة لا ترجمة لها هناك). */
export async function arabicRows(): Promise<DhikrRow[]> {
  const { data, error } = await createAdminClient().from("adhkar").select(COLUMNS).eq("lang", "ar").not("hadith_id", "like", `${SEED_PREFIX}%`).order("position");
  if (error) throw new Error(error.message);
  return (data ?? []) as DhikrRow[];
}

/**
 * يحفظ صفوف لغة واحدة (upsert)، ويحذف من هذه اللغة ما لم يعد في البناء.
 * وفي بناء العربية يُحذف من كل اللغات كل ذكر سقط من القائمة المقبولة (إلا البذرة seed-).
 */
export async function saveRows(lang: string, rows: DhikrRow[]): Promise<void> {
  const db = createAdminClient();
  const now = new Date().toISOString();
  if (rows.length) {
    const { error } = await db.from("adhkar").upsert(rows.map((r) => ({ ...r, updated_at: now })), { onConflict: "hadith_id,lang" });
    if (error) throw new Error(error.message);
  }
  const keep = rows.map((r) => r.hadith_id);
  const stale = db.from("adhkar").delete();
  const scoped = (lang === "ar" ? stale.neq("hadith_id", "") : stale.eq("lang", lang)).not("hadith_id", "like", `${SEED_PREFIX}%`);
  const { error } = keep.length ? await scoped.not("hadith_id", "in", `(${keep.map((k) => `"${k}"`).join(",")})`) : await scoped;
  if (error) throw new Error(error.message);
}
