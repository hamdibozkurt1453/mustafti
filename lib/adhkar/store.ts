import "server-only";

import { createClient as createPublicClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";
import { toDhikrs, type Dhikr } from "./group";
import type { DhikrRow } from "./rules";

export type { Dhikr };

const COLUMNS = "hadith_id, lang, occasions, position, title, text, explanation, grade, repeat_count, source_url";
/** F2: أعمدة migration ‏20261014_adhkar_timed.sql (قبل تنفيذها تُقرأ الأعمدة الأولى وحدها). */
const F2_COLUMNS = `${COLUMNS}, transliteration, meaning_en, reference`;
/** بذرة الأذكار المشهورة بتخريجها (في الـ migration): لا يحذفها بناء أذكار الموسوعة. */
export const SEED_PREFIX = "seed-";


type Reader = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** يقرأ صفوف لغات العرض بعميل واحد: أعمدة F2 أولاً، ثم الأعمدة الأولى إن لم تُنفَّذ migration ‏20261014. */
async function readRows(db: Reader, langs: string[]): Promise<{ rows: DhikrRow[] | null; error: string | null }> {
  const query = (columns: string) => db.from("adhkar").select(columns).in("lang", langs).order("position");
  let { data, error } = await query(F2_COLUMNS);
  if (error) ({ data, error } = await query(COLUMNS));
  return error || !data ? { rows: null, error: error?.message ?? "no data" } : { rows: data as DhikrRow[], error: null };
}

/**
 * الأذكار للعرض. [] إن لم تُبنَ بعد أو لم يُعدّ Supabase.
 * بالمفتاح العام بلا كوكيز الجلسة (سياسة RLS للقراءة العامة)، فتبقى الرئيسية ثابتة (ISR).
 * F2b: إن رُفضت القراءة العامة (في الإنتاج سُحبت صلاحية anon على الجدول، فكانت الصفحة فارغة مع 29 صفاً)،
 * تُقرأ بمفتاح الخادم (المحتوى عام أصلاً، والقراءة في الخادم فقط)، وتُصلح migration ‏20261015 الصلاحية.
 */
export async function listAdhkar(locale: string): Promise<Dhikr[]> {
  if (!isSupabaseConfigured()) return [];
  const langs = [...new Set(["ar", locale])];
  try {
    let { rows, error } = await readRows(createPublicClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } }), langs);
    if (!rows && isAdminClientConfigured()) {
      console.warn("adhkar public read failed, using server key:", error);
      ({ rows, error } = await readRows(createAdminClient(), langs));
    }
    if (!rows) {
      console.error("adhkar read:", error);
      return [];
    }
    return toDhikrs(rows, locale);
  } catch (e) {
    console.error("adhkar read:", e instanceof Error ? e.message : e);
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
