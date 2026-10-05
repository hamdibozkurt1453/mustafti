import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { DhikrRow, Occasion } from "./rules";

const COLUMNS = "hadith_id, lang, occasions, position, title, text, explanation, grade, repeat_count, source_url";

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
};

/** الأذكار للعرض (قراءة عامة بسياسة RLS). [] إن لم تُبنَ بعد أو لم يُعدّ Supabase. */
export async function listAdhkar(locale: string): Promise<Dhikr[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("adhkar")
      .select(COLUMNS)
      .in("lang", [...new Set(["ar", locale])])
      .order("position");
    if (error || !data) return [];
    const rows = data as DhikrRow[];
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
          meaning: tr ? tr.text : null,
          meaningGrade: tr?.grade ?? null,
          meaningUrl: tr?.source_url ?? null,
          explanation: tr ? tr.explanation : ar.explanation,
        };
      });
  } catch {
    return [];
  }
}

/** الصفوف العربية المحفوظة (أساس بناء اللغات الأخرى). */
export async function arabicRows(): Promise<DhikrRow[]> {
  const { data, error } = await createAdminClient().from("adhkar").select(COLUMNS).eq("lang", "ar").order("position");
  if (error) throw new Error(error.message);
  return (data ?? []) as DhikrRow[];
}

/**
 * يحفظ صفوف لغة واحدة (upsert)، ويحذف من هذه اللغة ما لم يعد في البناء.
 * وفي بناء العربية يُحذف من كل اللغات كل ذكر سقط من القائمة المقبولة.
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
  const scoped = lang === "ar" ? stale.neq("hadith_id", "") : stale.eq("lang", lang);
  const { error } = keep.length ? await scoped.not("hadith_id", "in", `(${keep.map((k) => `"${k}"`).join(",")})`) : await scoped;
  if (error) throw new Error(error.message);
}
