"use server";

import { getAuthContext } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { cityById } from "./cities";
import { encodeMethod, isMethod, settingsFromProfile, type PrayerSettings } from "./times";

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

/**
 * اختيار المستخدم المسجّل المحفوظ في profiles (city وcalc_method)، أو null للزائر أو لمن لم يختر بعد.
 * تستدعيه بطاقة المواقيت في الرئيسية حين لا يوجد اختيار في المتصفح (الصفحة نفسها ثابتة static).
 */
export async function getPrayerPrefs(): Promise<PrayerSettings | null> {
  const ctx = await getAuthContext();
  if (!ctx.userId) return null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("profiles").select("city, calc_method").eq("id", ctx.userId).maybeSingle();
    return settingsFromProfile(data);
  } catch {
    return null;
  }
}
