import "server-only";

import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";
import type { GuardResult } from "./guard";

/**
 * تسجيل اعتراضات الحارس في guard_log (الخطة، القسم 5): السبب والنص الأصلي فقط.
 * الكتابة بعميل service role (الجدول بلا سياسة إدراج). فشل التسجيل لا يوقف الرد.
 */
export async function logGuard(result: GuardResult, caseId: string | null = null): Promise<void> {
  const reason = [...new Set(result.findings.map((f) => f.reason))].join(",");
  const detail = result.findings.map((f) => `${f.reason}/${f.lang}: ${f.match}`).join(" | ");
  if (!isAdminClientConfigured()) {
    console.warn("guard:", reason, detail);
    return;
  }
  const { error } = await createAdminClient()
    .from("guard_log")
    .insert({
      case_id: caseId,
      reason: `${reason} — ${detail}`.slice(0, 1000),
      original_text: result.original.slice(0, 8000),
    });
  if (error) console.error("guard_log insert:", error.message);
}
