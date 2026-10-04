import "server-only";

import { cached, DAY, HOUR } from "@/lib/cache";
import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";
import { clip, htmlToText } from "./html";
import { politeFetch, politeHead } from "./polite-fetch";
import { BlockedError, type SourceResult } from "./types";

/**
 * «بيّنات: أسئلة وأجوبة عن الإسلام» (dawa.center/file/7937) مصدر أساسي للشبهات في المرجعية.
 * بحث الموقع ممنوع بـ robots.txt، فلا نبحث فيه. الملف يُفهرس محلياً في جدول bayyinat
 * (scripts/index-bayyinat.ts)، ويُبحث فيه بـ searchBayyinat() أدناه.
 * checkBayyinat() يقيّم إمكان الفهرسة: هل صفحة الملف مسموحة، وما روابط تنزيله، ونوع الملف وحجمه (HEAD بلا تنزيل).
 */
export const BAYYINAT_URL = "https://dawa.center/file/7937";

export type BayyinatCheck = {
  page: "allowed" | "blocked" | "error";
  reason?: string;
  title?: string;
  files: { url: string; status?: number; type?: string | null; bytes?: number | null; blocked?: string }[];
};

const FILE_LINK = /\.(pdf|docx?|epub|zip|rar|txt|json|xlsx?)(?:$|\?)|download/i;

export function checkBayyinat(): Promise<BayyinatCheck> {
  return cached("bayyinat:check", DAY, async () => {
    let page;
    try {
      page = await politeFetch(BAYYINAT_URL, { respectRobots: true });
    } catch (error) {
      const reason = String((error as Error).message).slice(0, 160);
      return { page: error instanceof BlockedError ? "blocked" : "error", reason, files: [] };
    }
    const links = [...page.text.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"'#]+)["']/gi)]
      .map((m) => {
        try {
          return new URL(m[1], page.finalUrl).toString();
        } catch {
          return "";
        }
      })
      .filter((u) => u && FILE_LINK.test(u));
    const unique = [...new Set(links)].slice(0, 4);
    const files: BayyinatCheck["files"] = [];
    for (const url of unique) {
      try {
        files.push({ url, ...(await politeHead(url)) });
      } catch (error) {
        files.push({ url, blocked: String((error as Error).message).slice(0, 120) });
      }
    }
    const title = htmlToText(page.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").slice(0, 160);
    return { page: "allowed", title, files };
  });
}

// ---------------------------------------------------------------------------
// البحث في الفهرس المحلي (جدول bayyinat في Supabase)
// ---------------------------------------------------------------------------

/** كم مرة نعيد فحص «هل الجدول فيه أسئلة؟» (الجدول يُملأ لاحقاً بالسكربت). */
const COUNT_TTL_MS = 10 * 60 * 1000;
const MAX_RESULTS = 5;

/** عدد الأسئلة في الجدول (0 إن كان فارغاً أو غير موجود أو Supabase غير مُعدّ). */
function bayyinatCount(): Promise<number> {
  return cached("bayyinat:count", COUNT_TTL_MS, async () => {
    if (!isAdminClientConfigured()) return 0;
    const { count, error } = await createAdminClient().from("bayyinat").select("number", { count: "exact", head: true });
    return error ? 0 : (count ?? 0);
  });
}

/** كلمات البحث بحروف وأرقام فقط، مجموعة بـ «أو» (to_tsquery بإعداد simple كما في العمود fts). */
export function bayyinatTsQuery(query: string): string {
  const words = [...new Set(query.replace(/\p{M}/gu, "").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1))].slice(0, 8);
  return words.join(" | ");
}

/**
 * بحث نصي في «بيّنات» على العمود fts. كل نتيجة تحمل رقم السؤال، ورابط الملف
 * (https://dawa.center/file/7937، بعلامة #رقم السؤال حتى لا تُدمج الأجوبة المختلفة).
 * الجدول الفارغ أو غير الموجود يُتجاهل بصمت: يعيد [] بلا خطأ.
 */
export async function searchBayyinat(query: string, lang: string): Promise<SourceResult[]> {
  const tsquery = bayyinatTsQuery(query);
  if (!tsquery || (await bayyinatCount().catch(() => 0)) === 0) return [];
  return cached(`bayyinat:search:${tsquery}`, HOUR, async () => {
    const { data, error } = await createAdminClient()
      .from("bayyinat")
      .select("number, question, answer, source_url, lang")
      .textSearch("fts", tsquery, { config: "simple" })
      .limit(MAX_RESULTS);
    if (error || !data) return [];
    return data.map((row) => ({
      title: `بيّنات — السؤال ${row.number}: ${clip(String(row.question), 140)}`,
      text: clip(String(row.answer), 1200),
      url: `${row.source_url || BAYYINAT_URL}#${row.number}`,
      source: "بيّنات: أسئلة وأجوبة عن الإسلام",
      sourceId: "bayyinat" as const,
      lang: row.lang || lang,
      ref: `bayyinat:${row.number}`,
    }));
  });
}
