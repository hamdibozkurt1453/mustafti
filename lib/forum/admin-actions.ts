"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthzError, requireRole } from "@/lib/auth/roles";
import { audit } from "@/lib/experts/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { FORUM_MOD_ROLES, MOD_ACTIONS, moderationPatch } from "./rules";
import { UUID_RE } from "./store";

/**
 * أفعال تبويب «الحوار» في لوحة المشرف (R4): إخفاء/إظهار، وقفل/فتح، وتثبيت/إلغاؤه، وحل البلاغ.
 * الدور يُفحص في الخادم لكل طلب (super_admin أو moderator بعد MFA)؛ viewer وreviewer مرفوضان.
 * الكتابة بمفتاح الخادم (لا سياسة RLS تسمح بها للعموم)، وكل فعل ناجح يُسجَّل في admin_audit.
 */

export type ModResult = { ok: true } | { ok: false; error: "forbidden" | "unauthorized" | "invalid" | "generic" };

function failFrom(error: unknown): ModResult {
  if (error instanceof AuthzError) return { ok: false, error: error.status === 401 ? "unauthorized" : "forbidden" };
  console.error("forum moderation:", error instanceof Error ? error.message : error);
  return { ok: false, error: "generic" };
}

const ModInput = z.object({
  targetType: z.enum(["thread", "post"]),
  targetId: z.string().regex(UUID_RE),
  action: z.enum(MOD_ACTIONS),
  /** حل البلاغات المفتوحة على المحتوى نفسه مع الفعل (مثلاً: إخفاء ثم حل). */
  resolve: z.boolean().optional(),
});

export async function moderateForum(input: unknown): Promise<ModResult> {
  try {
    const admin = await requireRole(FORUM_MOD_ROLES);
    const parsed = ModInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const { targetType, targetId, action, resolve } = parsed.data;
    const patch = moderationPatch(targetType, action);
    if (!patch) return { ok: false, error: "invalid" };

    const db = createAdminClient();
    const table = targetType === "thread" ? "forum_threads" : "forum_posts";
    const { data, error } = await db.from(table).update(patch).eq("id", targetId).select("id");
    if (error) return failFrom(error);
    if (!data?.length) return { ok: false, error: "invalid" };

    if (resolve) await resolveOpen(db, targetType, targetId, admin.userId!);
    await audit(admin.userId!, `forum.${targetType}.${action}`, targetId, { role: admin.role, ...(resolve ? { resolved: true } : {}) });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return failFrom(error);
  }
}

async function resolveOpen(db: ReturnType<typeof createAdminClient>, targetType: string, targetId: string, adminId: string) {
  const { data, error } = await db
    .from("forum_reports")
    .update({ status: "resolved", resolved_by: adminId, resolved_at: new Date().toISOString() })
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .eq("status", "open")
    .select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

/** «حل البلاغ»: كل البلاغات المفتوحة على المحتوى نفسه، بلا تغيير في المحتوى. */
export async function resolveForumReports(input: unknown): Promise<ModResult> {
  try {
    const admin = await requireRole(FORUM_MOD_ROLES);
    const parsed = z.object({ targetType: z.enum(["thread", "post"]), targetId: z.string().regex(UUID_RE) }).safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const { targetType, targetId } = parsed.data;
    const count = await resolveOpen(createAdminClient(), targetType, targetId, admin.userId!);
    if (!count) return { ok: false, error: "invalid" };
    await audit(admin.userId!, "forum.report.resolve", targetId, { role: admin.role, targetType, count });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return failFrom(error);
  }
}
