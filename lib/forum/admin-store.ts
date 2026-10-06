import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_FORUM_CATEGORIES, type ForumCategoryRow } from "./categories-data";
import { sortCategories } from "./category-rules";
import { authorsFor, type ForumAuthor } from "./store";

/**
 * F3: قراءات لوحة المشرف ← «الحوار» (بمفتاح الخادم، ولا تُستدعى إلا بعد requireRole في الصفحة):
 * كل الأبواب (ومنها المعطّل) بعدد مواضيعها، والمشرفون على الحوار، وأحدث الردود للحذف.
 */

export type AdminCategory = ForumCategoryRow & { threads: number };

export async function adminCategories(): Promise<{ rows: AdminCategory[]; ready: boolean }> {
  const db = createAdminClient();
  const { data, error } = await db.from("forum_categories").select('slug, name, "order", active').returns<ForumCategoryRow[]>();
  if (error) {
    // قبل تنفيذ migration ‏20261013_forum_categories.sql: الأبواب الافتراضية للعرض، بلا أزرار.
    console.error("admin forum categories:", error.message);
    return { rows: DEFAULT_FORUM_CATEGORIES.map((c) => ({ ...c, threads: 0 })), ready: false };
  }
  const { data: threads } = await db.from("forum_threads").select("category").returns<{ category: string }[]>();
  const counts = new Map<string, number>();
  for (const t of threads ?? []) counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
  return { rows: sortCategories(data ?? []).map((c) => ({ ...c, threads: counts.get(c.slug) ?? 0 })), ready: true };
}

export type ModeratorRow = { id: string; email: string | null; name: string | null; createdAt: string };

/** حسابات دور moderator (البريد للمشرف الأعلى وحده: الصفحة لا تعرض القائمة لغيره). */
export async function listModerators(): Promise<ModeratorRow[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("admins")
    .select("id, created_at, profiles!admins_id_fkey(email, display_name)")
    .eq("role", "moderator")
    .order("created_at", { ascending: true })
    .returns<{ id: string; created_at: string; profiles: { email: string | null; display_name: string | null } | null }[]>();
  if (error) {
    console.error("admin moderators:", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id, email: r.profiles?.email ?? null, name: r.profiles?.display_name ?? null, createdAt: r.created_at }));
}

export type AdminPostRow = { id: string; threadId: string; threadTitle: string; body: string; status: string; createdAt: string; author: ForumAuthor };

/** أحدث الردود بكل حالاتها (لحذف تعليق). */
export async function adminRecentPosts(limit = 20): Promise<AdminPostRow[]> {
  const { data, error } = await createAdminClient()
    .from("forum_posts")
    .select("id, thread_id, author_id, body, status, created_at, forum_threads(title)")
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<{ id: string; thread_id: string; author_id: string | null; body: string; status: string; created_at: string; forum_threads: { title: string } | null }[]>();
  if (error) console.error("admin forum posts:", error.message);
  const rows = data ?? [];
  const authors = await authorsFor(rows.map((r) => r.author_id));
  return rows.map((r) => ({
    id: r.id,
    threadId: r.thread_id,
    threadTitle: r.forum_threads?.title ?? "",
    body: r.body.slice(0, 300),
    status: r.status,
    createdAt: r.created_at,
    author: (r.author_id && authors.get(r.author_id)) || { id: null, name: null, expert: null },
  }));
}
