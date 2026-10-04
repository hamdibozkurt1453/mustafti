import "server-only";

import { cached, DAY } from "@/lib/cache";
import { htmlToText } from "./html";
import { politeFetch, politeHead } from "./polite-fetch";
import { BlockedError } from "./types";

/**
 * «بيّنات: أسئلة وأجوبة عن الإسلام» (dawa.center/file/7937) مصدر أساسي للشبهات في المرجعية.
 * بحث الموقع ممنوع بـ robots.txt، فلا نبحث فيه. هذا الفحص فقط يقيّم إمكان فهرسة الملف
 * محلياً لاحقاً: هل صفحة الملف مسموحة، وما روابط تنزيله، ونوع الملف وحجمه (HEAD بلا تنزيل).
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
