"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthzError, requireRole } from "@/lib/auth/roles";
import { audit } from "@/lib/experts/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { CASE_ACTION_ROLES } from "./rules";

/**
 * أفعال تبويب «الملفات» (S10): «إعادة التوجيه» و«إغلاق».
 * الدور يُفحص في الخادم لكل طلب (super_admin أو moderator بعد MFA)؛ viewer مرفوض دائماً.
 * التحديث مشروط بالحالة الحالية (لا سباق مع مختص يجيب)، وكل فعل ناجح يُسجَّل في admin_audit.
 */

export type CaseActionResult = { ok: true } | { ok: false; error: "forbidden" | "unauthorized" | "invalid" | "stale" | "generic" };

const Input = z.object({ caseId: z.uuid() });

async function run(input: unknown, action: "reassign" | "close"): Promise<CaseActionResult> {
  try {
    const admin = await requireRole(CASE_ACTION_ROLES);
    const parsed = Input.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const { caseId } = parsed.data;
    const db = createAdminClient();

    const { data: before } = await db.from("cases").select("status, assigned_expert").eq("id", caseId).maybeSingle();
    if (!before) return { ok: false, error: "invalid" };

    // فك الإسناد: من assigned فقط (المجاب عنه لا يُعاد، فلا جوابان لملف واحد).
    const update =
      action === "reassign"
        ? db.from("cases").update({ status: "submitted", assigned_expert: null }).eq("id", caseId).eq("status", "assigned")
        : db.from("cases").update({ status: "closed" }).eq("id", caseId).neq("status", "closed");
    const { data, error } = await update.select("id");
    if (error) return { ok: false, error: "generic" };
    if (!data?.length) return { ok: false, error: "stale" };

    await audit(admin.userId!, action === "reassign" ? "case.reassign" : "case.close", caseId, {
      role: admin.role,
      from: before.status,
      ...(before.assigned_expert ? { expert: before.assigned_expert } : {}),
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    if (error instanceof AuthzError) return { ok: false, error: error.status === 401 ? "unauthorized" : "forbidden" };
    console.error("admin case action:", error instanceof Error ? error.message : error);
    return { ok: false, error: "generic" };
  }
}

export async function reassignCase(input: unknown): Promise<CaseActionResult> {
  return run(input, "reassign");
}

export async function closeCase(input: unknown): Promise<CaseActionResult> {
  return run(input, "close");
}
