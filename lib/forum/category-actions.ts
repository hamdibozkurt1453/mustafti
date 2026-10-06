"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { locales } from "@/i18n/locales";
import { AuthzError, requireRole } from "@/lib/auth/roles";
import { audit } from "@/lib/experts/store";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ASSIGN_MOD_ROLES,
  CATEGORY_ADMIN_ROLES,
  moderatorAssignment,
  moveCategory,
  normalizeEmail,
  validateNewCategory,
} from "./category-rules";
import { CATEGORY_SLUG_RE, FORUM_MOD_ROLES } from "./rules";
import { UUID_RE } from "./store";

/**
 * F3: أفعال لوحة المشرف ← «الحوار» الجديدة:
 *   - الأبواب: إضافة، وتعطيل/تفعيل، وترتيب (super_admin).
 *   - تعيين دور moderator لحساب بالبريد، وإلغاؤه (super_admin).
 *   - حذف رد نهائياً (moderator فأعلى).
 * الدور يُفحص في الخادم لكل طلب (requireRole بعد MFA؛ viewer وreviewer مرفوضان)، والكتابة بمفتاح الخادم،
 * وكل فعل ناجح في admin_audit.
 */

export type AdminForumResult =
  | { ok: true }
  | { ok: false; error: "forbidden" | "unauthorized" | "invalid" | "generic" | "slug" | "duplicate" | "name" | "not_found" | "already" | "other_role" | "self" };

function failFrom(error: unknown): AdminForumResult {
  if (error instanceof AuthzError) return { ok: false, error: error.status === 401 ? "unauthorized" : "forbidden" };
  console.error("forum admin:", error instanceof Error ? error.message : error);
  return { ok: false, error: "generic" };
}

function done(): AdminForumResult {
  revalidatePath("/", "layout");
  return { ok: true };
}

async function allCategories(db: ReturnType<typeof createAdminClient>) {
  const { data, error } = await db.from("forum_categories").select('slug, "order"').returns<{ slug: string; order: number }[]>();
  if (error) throw error;
  return data ?? [];
}

// ---------------------------------------------------------------------------
// الأبواب
// ---------------------------------------------------------------------------

const NewCategory = z.object({
  slug: z.string().max(40),
  name: z.record(z.enum(locales), z.string().max(80)),
});

export async function addForumCategory(input: unknown): Promise<AdminForumResult> {
  try {
    const admin = await requireRole(CATEGORY_ADMIN_ROLES);
    const parsed = NewCategory.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const db = createAdminClient();
    const check = validateNewCategory(parsed.data, await allCategories(db));
    if (!check.ok) return { ok: false, error: check.error };
    const { error } = await db.from("forum_categories").insert(check.row);
    if (error) return error.code === "23505" ? { ok: false, error: "duplicate" } : failFrom(error);
    await audit(admin.userId!, "forum.category.add", check.row.slug, { name: check.row.name, order: check.row.order });
    return done();
  } catch (error) {
    return failFrom(error);
  }
}

const SlugInput = z.object({ slug: z.string().regex(CATEGORY_SLUG_RE) });

export async function setForumCategoryActive(input: unknown): Promise<AdminForumResult> {
  try {
    const admin = await requireRole(CATEGORY_ADMIN_ROLES);
    const parsed = SlugInput.extend({ active: z.boolean() }).safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const { slug, active } = parsed.data;
    const { data, error } = await createAdminClient().from("forum_categories").update({ active }).eq("slug", slug).select("slug");
    if (error) return failFrom(error);
    if (!data?.length) return { ok: false, error: "not_found" };
    await audit(admin.userId!, active ? "forum.category.enable" : "forum.category.disable", slug);
    return done();
  } catch (error) {
    return failFrom(error);
  }
}

export async function moveForumCategory(input: unknown): Promise<AdminForumResult> {
  try {
    const admin = await requireRole(CATEGORY_ADMIN_ROLES);
    const parsed = SlugInput.extend({ dir: z.enum(["up", "down"]) }).safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const db = createAdminClient();
    const updates = moveCategory(await allCategories(db), parsed.data.slug, parsed.data.dir);
    if (!updates.length) return { ok: false, error: "invalid" };
    for (const u of updates) {
      const { error } = await db.from("forum_categories").update({ order: u.order }).eq("slug", u.slug);
      if (error) return failFrom(error);
    }
    await audit(admin.userId!, "forum.category.move", parsed.data.slug, { dir: parsed.data.dir });
    return done();
  } catch (error) {
    return failFrom(error);
  }
}

// ---------------------------------------------------------------------------
// المشرفون على الحوار
// ---------------------------------------------------------------------------

export async function assignModerator(input: unknown): Promise<AdminForumResult> {
  try {
    const admin = await requireRole(ASSIGN_MOD_ROLES);
    const email = normalizeEmail((input as { email?: unknown } | null)?.email);
    if (!email) return { ok: false, error: "invalid" };
    const db = createAdminClient();
    const { data: profile, error } = await db.from("profiles").select("id").ilike("email", email).limit(1).maybeSingle<{ id: string }>();
    if (error) return failFrom(error);
    if (!profile) return { ok: false, error: "not_found" };
    if (profile.id === admin.userId) return { ok: false, error: "self" };

    const { data: current } = await db.from("admins").select("role").eq("id", profile.id).maybeSingle<{ role: string }>();
    const decision = moderatorAssignment(current?.role);
    if (decision !== "assign") return { ok: false, error: decision };

    const { error: insertError } = await db.from("admins").insert({ id: profile.id, role: "moderator", added_by: admin.userId });
    if (insertError) return failFrom(insertError);
    await audit(admin.userId!, "forum.moderator.assign", profile.id, { email });
    return done();
  } catch (error) {
    return failFrom(error);
  }
}

export async function removeModerator(input: unknown): Promise<AdminForumResult> {
  try {
    const admin = await requireRole(ASSIGN_MOD_ROLES);
    const parsed = z.object({ userId: z.string().regex(UUID_RE) }).safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    // يحذف دور moderator وحده (لا يمسّ أي دور إداري آخر).
    const { data, error } = await createAdminClient().from("admins").delete().eq("id", parsed.data.userId).eq("role", "moderator").select("id");
    if (error) return failFrom(error);
    if (!data?.length) return { ok: false, error: "not_found" };
    await audit(admin.userId!, "forum.moderator.remove", parsed.data.userId);
    return done();
  } catch (error) {
    return failFrom(error);
  }
}

// ---------------------------------------------------------------------------
// حذف تعليق
// ---------------------------------------------------------------------------

/** حذف رد نهائياً (moderator فأعلى): يُحفظ مقتطف منه في admin_audit، وتُحل بلاغاته المفتوحة. */
export async function deleteForumPost(input: unknown): Promise<AdminForumResult> {
  try {
    const admin = await requireRole(FORUM_MOD_ROLES);
    const parsed = z.object({ postId: z.string().regex(UUID_RE) }).safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const db = createAdminClient();
    const { data, error } = await db
      .from("forum_posts")
      .delete()
      .eq("id", parsed.data.postId)
      .select("id, thread_id, author_id, body")
      .returns<{ id: string; thread_id: string; author_id: string | null; body: string }[]>();
    if (error) return failFrom(error);
    const post = data?.[0];
    if (!post) return { ok: false, error: "not_found" };
    await db
      .from("forum_reports")
      .update({ status: "resolved", resolved_by: admin.userId, resolved_at: new Date().toISOString() })
      .eq("target_type", "post")
      .eq("target_id", post.id)
      .eq("status", "open");
    await audit(admin.userId!, "forum.post.delete", post.id, {
      role: admin.role,
      threadId: post.thread_id,
      authorId: post.author_id,
      excerpt: post.body.slice(0, 200),
    });
    return done();
  } catch (error) {
    return failFrom(error);
  }
}
