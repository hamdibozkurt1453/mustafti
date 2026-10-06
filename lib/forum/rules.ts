/**
 * قواعد «الحوار» (R4)، نقية بلا قاعدة بيانات ولا Next، فتُختبر محلياً:
 * الأبواب والحدود، ومن يكتب ومن يشرف، وحد السبام، وترتيب الردود، وأثر كل فعل إشرافي.
 * الفحص الفعلي في الخادم (lib/forum/actions.ts وadmin-actions.ts) وفي RLS (migrations/20261011_forum.sql).
 */

import type { AdminRole, Role } from "@/lib/auth/role-rules";

/** الأبواب (تطابق قيد category في الـ migration). */
export const FORUM_CATEGORIES = ["aqeedah", "ibadat", "muamalat", "family", "new_muslim", "general"] as const;
export type ForumCategory = (typeof FORUM_CATEGORIES)[number];

export function isForumCategory(value: unknown): value is ForumCategory {
  return (FORUM_CATEGORIES as readonly unknown[]).includes(value);
}

/** أسباب البلاغ (تطابق قيد reason). */
export const REPORT_REASONS = ["abuse", "takfir", "incitement", "spam", "fatwa", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** حدود الطول (تطابق قيود الجداول). */
export const LIMITS = {
  titleMin: 5,
  titleMax: 160,
  threadBodyMin: 10,
  postBodyMin: 2,
  bodyMax: 5000,
  noteMax: 500,
} as const;

/** حد السبام: 5 مشاركات (مواضيع وردود معاً) في 10 دقائق لكل حساب. */
export const SPAM_LIMIT = 5;
export const SPAM_WINDOW_MS = 10 * 60_000;

/** هل يُسمح بمشاركة جديدة؟ recent: تواريخ مشاركات الحساب (مواضيع وردود، ولو أُخفيت). */
export function spamAllowed(recent: readonly (string | Date)[], now: Date = new Date()): boolean {
  const since = now.getTime() - SPAM_WINDOW_MS;
  const inWindow = recent.filter((d) => {
    const t = typeof d === "string" ? Date.parse(d) : d.getTime();
    return Number.isFinite(t) && t > since;
  }).length;
  return inWindow < SPAM_LIMIT;
}

// ---------------------------------------------------------------------------
// الصلاحيات
// ---------------------------------------------------------------------------

/** أدوار الإشراف على الحوار: «moderator فأعلى». viewer وreviewer ليسا منها. */
export const FORUM_MOD_ROLES = ["super_admin", "moderator"] as const satisfies readonly AdminRole[];

/** الكتابة (موضوع، رد، إبلاغ) لأي حساب مسجّل. */
export function canPost(role: Role): boolean {
  return role !== "visitor";
}

export function canModerate(role: Role): boolean {
  return (FORUM_MOD_ROLES as readonly string[]).includes(role);
}

/** يرى تبويب «الحوار» في اللوحة: المشرفون عليه، وحساب الاطلاع (بلا أزرار). */
export function canSeeForumTab(role: AdminRole): boolean {
  return canModerate(role) || role === "viewer";
}

/** المختص المقبول وحده يكتب بلا حارس المنتدى، وبلا تنبيه «ليس فتوى». */
export function isVerifiedExpert(expertStatus: string | null | undefined): boolean {
  return expertStatus === "approved";
}

/** «جواب مختص»: المختص المقبول على رده هو فقط. */
export function canMarkExpertAnswer(
  viewer: { userId: string | null; expertStatus: string | null | undefined },
  postAuthorId: string | null,
): boolean {
  return Boolean(viewer.userId) && viewer.userId === postAuthorId && isVerifiedExpert(viewer.expertStatus);
}

/** هل يقبل الموضوع ردوداً جديدة؟ المقفل والمخفي لا. */
export function acceptsReplies(status: string): boolean {
  return status === "visible";
}

// ---------------------------------------------------------------------------
// الترتيب
// ---------------------------------------------------------------------------

type SortablePost = { is_expert_answer: boolean; created_at: string; authorIsExpert: boolean };

/**
 * ترتيب الردود: «جواب مختص» من مختص مقبول حالياً أولاً (بالأقدم)، ثم البقية بترتيب الزمن.
 * تمييز من حساب لم يعد مختصاً مقبولاً لا يقدّم رده.
 */
export function sortPosts<T extends SortablePost>(posts: readonly T[]): T[] {
  const featured = (p: T) => p.is_expert_answer && p.authorIsExpert;
  const byTime = (a: T, b: T) => Date.parse(a.created_at) - Date.parse(b.created_at);
  return [...posts.filter(featured).sort(byTime), ...posts.filter((p) => !featured(p)).sort(byTime)];
}

/** ترتيب القائمة: المثبّتة أولاً ثم الأحدث نشاطاً (القاعدة ترتب بالشيء نفسه). */
export function sortThreads<T extends { pinned: boolean; last_activity_at: string }>(threads: readonly T[]): T[] {
  return [...threads].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || Date.parse(b.last_activity_at) - Date.parse(a.last_activity_at),
  );
}

// ---------------------------------------------------------------------------
// الإشراف
// ---------------------------------------------------------------------------

export const MOD_ACTIONS = ["hide", "show", "lock", "unlock", "pin", "unpin"] as const;
export type ModAction = (typeof MOD_ACTIONS)[number];
export type ForumTarget = "thread" | "post";

/**
 * التحديث الذي يُحدثه الفعل، أو null إن لم يصح على هذا النوع.
 * القفل والتثبيت للمواضيع فقط. «إظهار» يعيد الموضوع ظاهراً (ويفك قفله إن كان مقفلاً).
 */
export function moderationPatch(target: ForumTarget, action: ModAction): Record<string, string | boolean> | null {
  switch (action) {
    case "hide":
      return { status: "hidden" };
    case "show":
      return { status: "visible" };
    case "lock":
      return target === "thread" ? { status: "locked" } : null;
    case "unlock":
      return target === "thread" ? { status: "visible" } : null;
    case "pin":
      return target === "thread" ? { pinned: true } : null;
    case "unpin":
      return target === "thread" ? { pinned: false } : null;
  }
}

/** الأفعال المتاحة لمحتوى بحالته الحالية (أزرار اللوحة). */
export function availableActions(target: ForumTarget, status: string, pinned = false): ModAction[] {
  const out: ModAction[] = [status === "hidden" ? "show" : "hide"];
  if (target === "thread") {
    if (status === "visible") out.push("lock");
    if (status === "locked") out.push("unlock");
    out.push(pinned ? "unpin" : "pin");
  }
  return out;
}

/** الرابط إلى المحادثة بعنوان الموضوع (زر «اسأل مُستفتي عن هذا»). */
export function askHref(title: string): { pathname: "/"; query: { q: string } } {
  return { pathname: "/", query: { q: title.trim().slice(0, 300) } };
}
