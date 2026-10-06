/**
 * F3: قواعد أبواب «الحوار» وإدارتها، نقية بلا قاعدة بيانات فتُختبر محلياً:
 * اسم الباب بلغة الواجهة، والتحقق من باب جديد، والترتيب، ومن يدير الأبواب ويعيّن المشرفين ويحذف الردود.
 * الفحص الفعلي في الخادم (lib/forum/category-actions.ts) وفي RLS (migrations/20261013_forum_categories.sql).
 */

import { locales, type Locale } from "@/i18n/locales";
import type { Role } from "@/lib/auth/role-rules";
import type { CategoryNames, ForumCategoryRow } from "./categories-data";
import { CATEGORY_SLUG_RE, canModerate } from "./rules";

/** اسم الباب بلغة الواجهة، ثم الإنجليزية، ثم العربية، ثم رمزه. */
export function categoryName(cat: { slug: string; name: CategoryNames } | undefined, locale: string, slug = ""): string {
  if (!cat) return slug;
  const n = cat.name;
  return n[locale as Locale]?.trim() || n.en?.trim() || n.ar?.trim() || cat.slug;
}

/** الأبواب بترتيب العرض (order ثم slug). */
export function sortCategories<T extends { slug: string; order: number }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
}

/** الأبواب المفعّلة وحدها (للنموذج والفلتر). */
export function activeCategories<T extends { active: boolean; slug: string; order: number }>(rows: readonly T[]): T[] {
  return sortCategories(rows.filter((r) => r.active));
}

/**
 * تحويل الباب القديم: الرمز المعروف يبقى، وغيره يصير general (كما تفعل الـ migration).
 */
export function migrateCategory(value: string, known: readonly string[]): string {
  return known.includes(value) ? value : "general";
}

export type NewCategoryInput = { slug: string; name: Record<string, string>; order?: number | null };

export type CategoryCheck =
  | { ok: true; row: ForumCategoryRow }
  | { ok: false; error: "slug" | "duplicate" | "name" };

const NAME_MAX = 40;

/**
 * التحقق من باب جديد: slug بالصيغة وغير مكرر، والاسم العربي والإنجليزي إلزاميان (بقية اللغات اختيارية
 * وتعود إلى الإنجليزية عند العرض)، وكل اسم بين 2 و40 حرفاً. الترتيب الافتراضي بعد آخر باب قبل «عام».
 */
export function validateNewCategory(input: NewCategoryInput, existing: readonly { slug: string; order: number }[]): CategoryCheck {
  const slug = input.slug.trim().toLowerCase();
  if (!CATEGORY_SLUG_RE.test(slug)) return { ok: false, error: "slug" };
  if (existing.some((c) => c.slug === slug)) return { ok: false, error: "duplicate" };

  const name: CategoryNames = {};
  for (const l of locales) {
    const v = (input.name[l] ?? "").replace(/\s+/g, " ").trim();
    if (!v) continue;
    if (v.length < 2 || v.length > NAME_MAX) return { ok: false, error: "name" };
    name[l] = v;
  }
  if (!name.ar || !name.en) return { ok: false, error: "name" };

  const order =
    typeof input.order === "number" && Number.isInteger(input.order)
      ? input.order
      : Math.max(0, ...existing.filter((c) => c.slug !== "general").map((c) => c.order)) + 10;
  return { ok: true, row: { slug, name, order, active: true } };
}

/**
 * نقل باب درجة لأعلى أو لأسفل في ترتيب العرض: تبادل قيمتي order مع جاره.
 * يعيد التحديثات اللازمة (صفّان)، أو [] إن كان في الطرف أو غير موجود.
 */
export function moveCategory(
  rows: readonly { slug: string; order: number }[],
  slug: string,
  dir: "up" | "down",
): { slug: string; order: number }[] {
  const sorted = sortCategories(rows);
  const i = sorted.findIndex((r) => r.slug === slug);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= sorted.length) return [];
  const a = sorted[i];
  const b = sorted[j];
  // ترتيب متساوٍ: يُفصل بينهما بدرجة حتى يظهر النقل.
  const [oa, ob] = a.order === b.order ? (dir === "up" ? [b.order - 1, a.order] : [b.order + 1, a.order]) : [b.order, a.order];
  return [
    { slug: a.slug, order: oa },
    { slug: b.slug, order: ob },
  ];
}

// ---------------------------------------------------------------------------
// الصلاحيات
// ---------------------------------------------------------------------------

/** إضافة باب وتعطيله وترتيبه: المشرف الأعلى وحده. */
export const CATEGORY_ADMIN_ROLES = ["super_admin"] as const;
/** تعيين دور moderator لمستخدم بالبريد (وإلغاؤه): المشرف الأعلى وحده. */
export const ASSIGN_MOD_ROLES = ["super_admin"] as const;

export function canManageCategories(role: Role): boolean {
  return (CATEGORY_ADMIN_ROLES as readonly string[]).includes(role);
}

export function canAssignModerator(role: Role): boolean {
  return (ASSIGN_MOD_ROLES as readonly string[]).includes(role);
}

/** حذف تعليق (رد) نهائياً: moderator فأعلى، ويُسجَّل في admin_audit. */
export function canDeletePost(role: Role): boolean {
  return canModerate(role);
}

/**
 * هل يُعيَّن صاحب هذا الدور الحالي مشرفاً للحوار؟ من لا دور له يُعيَّن، ومن هو moderator لا تغيير،
 * وأي دور إداري آخر (super_admin، reviewer، viewer) لا يُخفَّض من هنا.
 */
export function moderatorAssignment(current: string | null | undefined): "assign" | "already" | "other_role" {
  if (!current) return "assign";
  return current === "moderator" ? "already" : "other_role";
}

/** صيغة البريد للبحث عن الحساب (المقارنة بأحرف صغيرة). */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254 ? e : null;
}
