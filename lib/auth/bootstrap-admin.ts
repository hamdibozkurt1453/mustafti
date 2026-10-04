import "server-only";

import type { User } from "@supabase/supabase-js";
import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";

/** قائمة ADMIN_EMAILS (مفصولة بفواصل)، بأحرف صغيرة. */
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * المشرف الأول: أي بريد في ADMIN_EMAILS يُعطى super_admin عند أول دخول.
 * يُستدعى بعد كل دخول ناجح (كلمة مرور أو رابط سحري). لا يعمل إلا لبريد مؤكَّد،
 * ولا يغيّر دور مشرف موجود.
 */
export async function bootstrapAdmin(user: User): Promise<void> {
  const email = user.email?.toLowerCase();
  if (!email || !user.email_confirmed_at) return;
  if (!adminEmails().includes(email)) return;
  if (!isAdminClientConfigured()) return;

  const db = createAdminClient();

  // الملف الشخصي يُنشأ بالمشغّل عادةً؛ هذا احتياط لحساب سبق تنفيذ schema.sql.
  await db.from("profiles").upsert({ id: user.id, email: user.email }, { onConflict: "id", ignoreDuplicates: true });

  const { data: existing } = await db.from("admins").select("id").eq("id", user.id).maybeSingle();
  if (existing) return;

  const { error } = await db.from("admins").insert({ id: user.id, role: "super_admin" });
  if (error) {
    console.error("bootstrapAdmin:", error.message);
    return;
  }
  await db.from("admin_audit").insert({
    admin_id: user.id,
    action: "bootstrap_super_admin",
    target: user.id,
    details: { source: "ADMIN_EMAILS" },
  });
}
