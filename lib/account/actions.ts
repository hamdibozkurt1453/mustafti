"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { locales, type Locale } from "@/i18n/locales";
import { getAuthContext } from "@/lib/auth/roles";
import { AVATAR_BUCKET, EXPERT_BUCKET } from "@/lib/experts/types";
import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { deleteConfirmed, parseAccountInput } from "./rules";

export type AccountResult = { ok: true } | { ok: false; error: "invalid" | "auth" | "notConfigured" | "admin" | "expertAnswers" | "confirm" | "generic" };

/** «الملف»: الاسم واللغة المفضّلة في profiles، بجلسة المستخدم (RLS: صفّه فقط). */
export async function updateAccount(input: unknown): Promise<AccountResult> {
  const ctx = await getAuthContext();
  if (!ctx.userId) return { ok: false, error: "auth" };
  const parsed = parseAccountInput(input);
  if (!parsed) return { ok: false, error: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.displayName, preferred_lang: parsed.preferredLang })
    .eq("id", ctx.userId);
  if (error) {
    console.error("update account:", error.message);
    return { ok: false, error: "generic" };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** يحذف كل ملفات المستخدم في مخزن واحد (مجلده {user_id}/). */
async function removeFolder(bucket: string, userId: string) {
  const storage = createAdminClient().storage.from(bucket);
  const { data } = await storage.list(userId, { limit: 1000 });
  const paths = (data ?? []).map((f) => `${userId}/${f.name}`);
  if (paths.length) await storage.remove(paths);
}

/**
 * «حذف حسابي وبياناتي» (R2) بتأكيد مزدوج (نافذة تأكيد ثم كتابة العبارة، وتُفحص العبارة هنا أيضاً).
 * يحذف: الحساب (auth.users)، ومعه بالتتابع profiles وexperts، وملفات المستخدم في المخازن.
 * ويفصل المسائل عن الحساب (owner_id ← null بقيد المخطط، ونمحو بريد المتابعة)، ولا يحذف أجوبة المختصين:
 * أجوبة المختص نفسه تُفصل عنه (expert_id ← null) قبل الحذف، وإن لم تُنفَّذ migration
 * ‏20261008_account_deletion.sql بعد يُرفض الحذف ولا يُمسّ شيء.
 * المشرفون لا يحذفون حساباتهم من هنا (حتى لا تبقى اللوحة بلا مشرف)، بل بطلب من super_admin.
 */
export async function deleteAccount(input: { confirm: string; locale: string }): Promise<AccountResult> {
  const ctx = await getAuthContext();
  if (!ctx.userId) return { ok: false, error: "auth" };
  if (!isAdminClientConfigured()) return { ok: false, error: "notConfigured" };
  if (ctx.adminRole) return { ok: false, error: "admin" };
  const locale = (locales as readonly string[]).includes(input.locale) ? (input.locale as Locale) : "ar";
  const t = await getTranslations({ locale, namespace: "me.settings" });
  if (!deleteConfirmed(input.confirm, t("confirmPhrase"))) return { ok: false, error: "confirm" };

  const uid = ctx.userId;
  const db = createAdminClient();
  try {
    if (ctx.expertStatus) {
      const { error } = await db.from("expert_answers").update({ expert_id: null }).eq("expert_id", uid);
      if (error) {
        console.error("delete account (answers):", error.message);
        return { ok: false, error: "expertAnswers" };
      }
    }
    const { error: casesError } = await db.from("cases").update({ contact_email: null }).eq("owner_id", uid);
    if (casesError) throw new Error(casesError.message);

    await Promise.all([removeFolder(EXPERT_BUCKET, uid), removeFolder(AVATAR_BUCKET, uid)]).catch((e) =>
      console.error("delete account (storage):", e instanceof Error ? e.message : e),
    );

    const { error } = await db.auth.admin.deleteUser(uid);
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error("delete account:", error instanceof Error ? error.message : error);
    return { ok: false, error: "generic" };
  }

  // الجلسة لم تعد صالحة: نمحو كوكيزها.
  try {
    await (await createClient()).auth.signOut();
  } catch {
    /* المستخدم محذوف أصلاً */
  }
  return { ok: true };
}
