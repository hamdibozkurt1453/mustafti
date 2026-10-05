import "server-only";

import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";
import { islamqaResult, type IslamqaHit } from "./islamqa-data";
import type { SourceResult } from "./types";

/**
 * موصّل «الإسلام سؤال وجواب» المحلي (R1d): البحث في جدول islamqa_fatwas بالدالة
 * public.search_islamqa(q, lang, n) بمفتاح الخادم (لا قراءة عامة). سريع (Postgres، بلا شبكة خارجية)،
 * فيبدأ أولاً مع «بيّنات» و«الأساسيات» وMCP.
 *
 * queries: عبارات البحث العربية (لكل اللغات: الأجوبة العربية محفوظة كاملة)، والسؤال نفسه بالإنجليزية
 * للسائل بالإنجليزية. النتائج تُدمج بالمعرّف (أعلى درجة)، والمقتطف حرفي من الجواب (islamqa-data.ts).
 */
export type IslamqaQuery = { q: string; lang: "ar" | "en" };

export async function searchIslamqaLocal(
  queries: IslamqaQuery[],
  userLang: string,
  terms: string[],
  opts: { n?: number; onError?: (e: string) => void } = {},
): Promise<SourceResult[]> {
  if (!isAdminClientConfigured() || !queries.length) return [];
  const client = createAdminClient();
  const n = opts.n ?? 4;
  const lists = await Promise.all(
    queries.map(async ({ q, lang }) => {
      const { data, error } = await client.rpc("search_islamqa", { q: q.trim().slice(0, 300), lang, n });
      if (error) opts.onError?.(`search_islamqa: ${error.message}`.slice(0, 300));
      return (Array.isArray(data) ? data : []) as IslamqaHit[];
    }),
  );
  const best = new Map<string, IslamqaHit>();
  for (const hit of lists.flat()) {
    const prev = best.get(hit.original_id);
    if (!prev || (hit.score ?? 0) > (prev.score ?? 0)) best.set(hit.original_id, hit);
  }
  return [...best.values()]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, n + 2)
    .map((h) => islamqaResult(h, userLang, terms))
    .filter((x): x is SourceResult => x !== null);
}
