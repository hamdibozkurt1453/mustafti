"use server";

import { getAuthContext } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { cityById } from "./cities";
import { encodeMethod, isMethod } from "./times";

/**
 * يحفظ اختيار المواقيت في profiles للمستخدم المسجّل (بجلسته، وRLS يقصره على صفّه).
 * لا إحداثيات أبداً: city معرّف مدينة من القائمة المضمّنة أو null (حين يستعمل موقع المتصفح).
 * للزائر: لا شيء (الاختيار في متصفحه فقط).
 */
export async function savePrayerPrefs(input: { cityId: string | null; method: string; madhab: string }): Promise<{ ok: boolean }> {
  const ctx = await getAuthContext();
  if (!ctx.userId) return { ok: false };
  if (!isMethod(input.method)) return { ok: false };
  const city = input.cityId && cityById(input.cityId) ? input.cityId : null;
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ city, calc_method: encodeMethod(input.method, input.madhab === "hanafi" ? "hanafi" : "shafi") })
    .eq("id", ctx.userId);
  return { ok: !error };
}
