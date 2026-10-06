import "server-only";

import { avatarUrl, type ExpertRole } from "@/lib/experts/types";
import { isSupabaseConfigured, SUPABASE_URL } from "@/lib/supabase/env";
import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isForumCategory, sortPosts, SPAM_WINDOW_MS, type ForumCategory, type ReportReason } from "./rules";

/**
 * قراءات «الحوار» (R4).
 * - المواضيع والردود تُقرأ بجلسة الزائر أو المستخدم (المفتاح العام + RLS): الظاهر والمقفل فقط.
 * - أسماء الكتّاب وشارة المختص بمفتاح الخادم: الاسم المعروض فقط، والمختص المقبول بدوره ورابط ملفه العام.
 *   لا بريد ولا أي بيان آخر.
 * - قراءات اللوحة (البلاغات وكل الحالات) بمفتاح الخادم، ولا تُستدعى إلا بعد requireRole في الصفحة.
 * قبل تنفيذ الـ migration (الجداول غير موجودة) تعيد القراءات قوائم فارغة، والخطأ في السجل.
 */

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ForumAuthor = {
  id: string | null;
  name: string | null;
  /** F1: صورة الحساب من profiles (بدل الحرف الأول)، وللمختص صورته في experts إن لم تكن. */
  avatarUrl?: string | null;
  /** المختص المقبول حالياً فقط. */
  expert: { role: ExpertRole; slug: string; avatarUrl: string | null } | null;
};

export type ThreadSummary = {
  id: string;
  title: string;
  category: ForumCategory;
  lang: string;
  status: "visible" | "locked";
  pinned: boolean;
  repliesCount: number;
  createdAt: string;
  lastActivityAt: string;
  author: ForumAuthor;
};

export type ThreadView = ThreadSummary & { body: string; rulingNotice: boolean };

export type PostView = {
  id: string;
  body: string;
  isExpertAnswer: boolean;
  /** «جواب مختص» من مختص مقبول حالياً: يظهر أولاً وبالشارة. */
  featured: boolean;
  rulingNotice: boolean;
  createdAt: string;
  author: ForumAuthor;
};

type ThreadRow = {
  id: string;
  author_id: string | null;
  title: string;
  body?: string;
  category: string;
  lang: string;
  status: "visible" | "locked";
  pinned: boolean;
  ruling_notice?: boolean;
  replies_count: number;
  created_at: string;
  last_activity_at: string;
};

type PostRow = {
  id: string;
  author_id: string | null;
  body: string;
  is_expert_answer: boolean;
  ruling_notice: boolean;
  created_at: string;
};

const LIST_COLUMNS = "id, author_id, title, category, lang, status, pinned, replies_count, created_at, last_activity_at";

/** الأسماء المعروضة وشارات المختصين المقبولين لمعرّفات الكتّاب. */
export async function authorsFor(ids: (string | null)[]): Promise<Map<string, ForumAuthor>> {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const out = new Map<string, ForumAuthor>();
  for (const id of unique) out.set(id, { id, name: null, expert: null });
  if (!unique.length || !isAdminClientConfigured()) return out;
  const db = createAdminClient();
  type ProfileRow = { id: string; display_name: string | null; avatar_path?: string | null };
  const readProfiles = async () => {
    const first = await db.from("profiles").select("id, display_name, avatar_path").in("id", unique).returns<ProfileRow[]>();
    // قبل migration ‏20261012_profile_avatar_bio.sql: بلا عمود الصورة.
    return first.error ? await db.from("profiles").select("id, display_name").in("id", unique).returns<ProfileRow[]>() : first;
  };
  const [{ data: profiles, error: pErr }, { data: experts, error: eErr }] = await Promise.all([
    readProfiles(),
    db
      .from("experts")
      .select("id, role, slug, avatar_path")
      .in("id", unique)
      .eq("status", "approved")
      .returns<{ id: string; role: ExpertRole; slug: string | null; avatar_path: string | null }[]>(),
  ]);
  if (pErr) console.error("forum authors:", pErr.message);
  if (eErr) console.error("forum experts:", eErr.message);
  for (const p of profiles ?? []) {
    out.get(p.id)!.name = p.display_name?.trim() || null;
    out.get(p.id)!.avatarUrl = avatarUrl(p.avatar_path, SUPABASE_URL);
  }
  for (const e of experts ?? []) {
    if (e.slug) out.get(e.id)!.expert = { role: e.role, slug: e.slug, avatarUrl: avatarUrl(e.avatar_path, SUPABASE_URL) };
  }
  return out;
}

const noAuthor: ForumAuthor = { id: null, name: null, expert: null };

function toSummary(row: ThreadRow, authors: Map<string, ForumAuthor>): ThreadSummary {
  return {
    id: row.id,
    title: row.title,
    category: isForumCategory(row.category) ? row.category : "general",
    lang: row.lang,
    status: row.status,
    pinned: row.pinned,
    repliesCount: row.replies_count,
    createdAt: row.created_at,
    lastActivityAt: row.last_activity_at,
    author: (row.author_id && authors.get(row.author_id)) || noAuthor,
  };
}

/** يهرّب محارف ilike الخاصة (% و_ و\) ويحذف ما يكسر صيغة or() في PostgREST. */
export function ilikePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/[,()]/g, " ").trim()}%`;
}

/** قائمة المواضيع: المثبّتة أولاً ثم الأحدث نشاطاً، بفلتر الباب والبحث بالعنوان. */
export async function listThreads({
  category,
  q,
  limit = 50,
}: { category?: ForumCategory | null; q?: string | null; limit?: number } = {}): Promise<ThreadSummary[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  let query = supabase
    .from("forum_threads")
    .select(LIST_COLUMNS)
    .order("pinned", { ascending: false })
    .order("last_activity_at", { ascending: false })
    .limit(limit);
  if (category) query = query.eq("category", category);
  const term = q?.trim().slice(0, 100);
  if (term) query = query.ilike("title", ilikePattern(term));
  const { data, error } = await query.returns<ThreadRow[]>();
  if (error) console.error("forum threads:", error.message);
  const rows = data ?? [];
  const authors = await authorsFor(rows.map((r) => r.author_id));
  return rows.map((r) => toSummary(r, authors));
}

/** الموضوع وردوده الظاهرة («جواب مختص» أولاً)، أو null إن لم يوجد أو أُخفي. */
export async function getThread(id: string): Promise<{ thread: ThreadView; posts: PostView[] } | null> {
  if (!UUID_RE.test(id) || !isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("forum_threads")
    .select(`${LIST_COLUMNS}, body, ruling_notice`)
    .eq("id", id)
    .maybeSingle<ThreadRow>();
  if (error) console.error("forum thread:", error.message);
  if (!row) return null;

  const { data: postRows, error: postsError } = await supabase
    .from("forum_posts")
    .select("id, author_id, body, is_expert_answer, ruling_notice, created_at")
    .eq("thread_id", id)
    .order("created_at", { ascending: true })
    .limit(500)
    .returns<PostRow[]>();
  if (postsError) console.error("forum posts:", postsError.message);

  const posts = postRows ?? [];
  const authors = await authorsFor([row.author_id, ...posts.map((p) => p.author_id)]);
  const author = (aid: string | null) => (aid && authors.get(aid)) || noAuthor;
  const sorted = sortPosts(posts.map((p) => ({ ...p, authorIsExpert: Boolean(author(p.author_id).expert) })));

  return {
    thread: { ...toSummary(row, authors), body: row.body ?? "", rulingNotice: Boolean(row.ruling_notice) },
    posts: sorted.map((p) => ({
      id: p.id,
      body: p.body,
      isExpertAnswer: p.is_expert_answer,
      featured: p.is_expert_answer && p.authorIsExpert,
      rulingNotice: p.ruling_notice,
      createdAt: p.created_at,
      author: author(p.author_id),
    })),
  };
}

/** مشاركات الحساب في آخر 10 دقائق (ولو أُخفيت)، لحد السبام قبل النشر. */
export async function recentPostingTimes(userId: string, now = new Date()): Promise<string[]> {
  if (!isAdminClientConfigured()) return [];
  const since = new Date(now.getTime() - SPAM_WINDOW_MS).toISOString();
  const db = createAdminClient();
  const [threads, posts] = await Promise.all([
    db.from("forum_threads").select("created_at").eq("author_id", userId).gt("created_at", since).returns<{ created_at: string }[]>(),
    db.from("forum_posts").select("created_at").eq("author_id", userId).gt("created_at", since).returns<{ created_at: string }[]>(),
  ]);
  return [...(threads.data ?? []), ...(posts.data ?? [])].map((r) => r.created_at);
}

/** «مشاركاتي في الحوار» في /me: مواضيع الحساب وردوده الظاهرة (بجلسته، RLS). */
export async function myForumActivity(userId: string): Promise<{
  threads: { id: string; title: string; repliesCount: number; lastActivityAt: string }[];
  posts: { id: string; threadId: string; threadTitle: string; body: string; createdAt: string }[];
}> {
  if (!isSupabaseConfigured()) return { threads: [], posts: [] };
  const supabase = await createClient();
  const [{ data: threads, error: tErr }, { data: posts, error: pErr }] = await Promise.all([
    supabase
      .from("forum_threads")
      .select("id, title, replies_count, last_activity_at")
      .eq("author_id", userId)
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<{ id: string; title: string; replies_count: number; last_activity_at: string }[]>(),
    supabase
      .from("forum_posts")
      .select("id, thread_id, body, created_at, forum_threads(title)")
      .eq("author_id", userId)
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<{ id: string; thread_id: string; body: string; created_at: string; forum_threads: { title: string } | null }[]>(),
  ]);
  if (tErr) console.error("my forum threads:", tErr.message);
  if (pErr) console.error("my forum posts:", pErr.message);
  return {
    threads: (threads ?? []).map((t) => ({ id: t.id, title: t.title, repliesCount: t.replies_count, lastActivityAt: t.last_activity_at })),
    posts: (posts ?? []).map((p) => ({
      id: p.id,
      threadId: p.thread_id,
      threadTitle: p.forum_threads?.title ?? "",
      body: p.body,
      createdAt: p.created_at,
    })),
  };
}

// ---------------------------------------------------------------------------
// لوحة المشرف (بعد requireRole)
// ---------------------------------------------------------------------------

export type AdminReportGroup = {
  /** أقدم بلاغ مفتوح في المجموعة (لترتيب ثابت). */
  firstAt: string;
  reportIds: string[];
  targetType: "thread" | "post";
  targetId: string;
  reasons: { reason: ReportReason; note: string | null; createdAt: string }[];
  /** المحتوى المبلَّغ عنه (null إن حُذف). */
  target: {
    threadId: string;
    title: string;
    excerpt: string;
    status: string;
    pinned: boolean;
    author: ForumAuthor;
  } | null;
};

/** البلاغات المفتوحة مجمّعة حسب المحتوى، مع المحتوى وحالته. */
export async function openReports(limit = 100): Promise<AdminReportGroup[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("forum_reports")
    .select("id, target_type, target_id, reason, note, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(limit)
    .returns<{ id: string; target_type: "thread" | "post"; target_id: string; reason: ReportReason; note: string | null; created_at: string }[]>();
  if (error) console.error("forum reports:", error.message);

  const groups = new Map<string, AdminReportGroup>();
  for (const r of data ?? []) {
    const key = `${r.target_type}:${r.target_id}`;
    const g =
      groups.get(key) ??
      ({ firstAt: r.created_at, reportIds: [], targetType: r.target_type, targetId: r.target_id, reasons: [], target: null } as AdminReportGroup);
    g.reportIds.push(r.id);
    g.reasons.push({ reason: r.reason, note: r.note, createdAt: r.created_at });
    groups.set(key, g);
  }
  const list = [...groups.values()];
  const threadIds = list.filter((g) => g.targetType === "thread").map((g) => g.targetId);
  const postIds = list.filter((g) => g.targetType === "post").map((g) => g.targetId);

  const [{ data: threads }, { data: posts }] = await Promise.all([
    threadIds.length
      ? db.from("forum_threads").select("id, author_id, title, body, status, pinned").in("id", threadIds)
          .returns<{ id: string; author_id: string | null; title: string; body: string; status: string; pinned: boolean }[]>()
      : Promise.resolve({ data: [] as { id: string; author_id: string | null; title: string; body: string; status: string; pinned: boolean }[] }),
    postIds.length
      ? db.from("forum_posts").select("id, author_id, thread_id, body, status, forum_threads(title)").in("id", postIds)
          .returns<{ id: string; author_id: string | null; thread_id: string; body: string; status: string; forum_threads: { title: string } | null }[]>()
      : Promise.resolve({ data: [] as { id: string; author_id: string | null; thread_id: string; body: string; status: string; forum_threads: { title: string } | null }[] }),
  ]);
  const authors = await authorsFor([...(threads ?? []).map((t) => t.author_id), ...(posts ?? []).map((p) => p.author_id)]);
  const author = (aid: string | null) => (aid && authors.get(aid)) || noAuthor;
  const tMap = new Map((threads ?? []).map((t) => [t.id, t]));
  const pMap = new Map((posts ?? []).map((p) => [p.id, p]));

  for (const g of list) {
    if (g.targetType === "thread") {
      const t = tMap.get(g.targetId);
      if (t) g.target = { threadId: t.id, title: t.title, excerpt: t.body.slice(0, 400), status: t.status, pinned: t.pinned, author: author(t.author_id) };
    } else {
      const p = pMap.get(g.targetId);
      if (p) g.target = { threadId: p.thread_id, title: p.forum_threads?.title ?? "", excerpt: p.body.slice(0, 400), status: p.status, pinned: false, author: author(p.author_id) };
    }
  }
  return list.sort((a, b) => b.reportIds.length - a.reportIds.length || Date.parse(a.firstAt) - Date.parse(b.firstAt));
}

export type AdminThreadRow = { id: string; title: string; status: string; pinned: boolean; repliesCount: number; lastActivityAt: string; author: ForumAuthor };

/** أحدث المواضيع بكل حالاتها (ومنها المخفي) للتثبيت والقفل والإخفاء. */
export async function adminRecentThreads(limit = 30): Promise<AdminThreadRow[]> {
  const { data, error } = await createAdminClient()
    .from("forum_threads")
    .select("id, author_id, title, status, pinned, replies_count, last_activity_at")
    .order("pinned", { ascending: false })
    .order("last_activity_at", { ascending: false })
    .limit(limit)
    .returns<{ id: string; author_id: string | null; title: string; status: string; pinned: boolean; replies_count: number; last_activity_at: string }[]>();
  if (error) console.error("admin forum threads:", error.message);
  const rows = data ?? [];
  const authors = await authorsFor(rows.map((r) => r.author_id));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    pinned: r.pinned,
    repliesCount: r.replies_count,
    lastActivityAt: r.last_activity_at,
    author: (r.author_id && authors.get(r.author_id)) || noAuthor,
  }));
}

/** عدد البلاغات المفتوحة (شارة التبويب). */
export async function openReportsCount(): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("forum_reports")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");
  if (error) console.error("forum reports count:", error.message);
  return count ?? 0;
}
