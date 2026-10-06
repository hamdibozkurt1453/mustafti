import "server-only";

import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_FORUM_CATEGORIES, type ForumCategoryRow } from "./categories-data";
import { categoryName, sortCategories } from "./category-rules";

/**
 * F3: أبواب «الحوار» من جدول forum_categories (القراءة للجميع بـ RLS)، مرة لكل طلب.
 * قبل تنفيذ الـ migration أو عند تعذّر القراءة: الأبواب الافتراضية (lib/forum/categories-data.ts).
 */
export const listCategories = cache(async (): Promise<ForumCategoryRow[]> => {
  if (!isSupabaseConfigured()) return DEFAULT_FORUM_CATEGORIES;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("forum_categories")
    .select('slug, name, "order", active')
    .returns<ForumCategoryRow[]>();
  if (error || !data?.length) {
    if (error) console.error("forum categories:", error.message);
    return DEFAULT_FORUM_CATEGORIES;
  }
  return sortCategories(data);
});

/** دالة أسماء الأبواب بلغة الواجهة (للقائمة وصفحة الموضوع والنموذج). */
export async function categoryNamer(locale: string): Promise<(slug: string) => string> {
  const rows = await listCategories();
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  return (slug) => categoryName(bySlug.get(slug), locale, slug);
}
