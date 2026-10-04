import "server-only";

import { methodsFor } from "./connectors";
import { sampleLinks } from "./html";
import { politeFetch } from "./polite-fetch";
import { SOURCES, SOURCE_BY_ID, type SourceDef } from "./registry";
import { BlockedError, type AccessKind, type SourceId, type SourceResult, type SourceStatus } from "./types";

export { SOURCES, SOURCE_BY_ID } from "./registry";
export type { SourceResult, SourceId } from "./types";

/**
 * البحث في مصدر واحد بالواجهة الموحدة:
 *   search(query, lang) => [{ title, text, url, source, sourceId, grade?, lang }]
 * يجرب طرق الوصول بالترتيب (MCP ← API ← الموقع)، ويعيد نتائج أول طريقة تنجح بنتائج.
 * فشل طريقة لا يوقف البحث: ينتقل إلى التالية، وإن فشلت كلها يعيد [].
 */
export async function search(id: SourceId, query: string, lang: string): Promise<SourceResult[]> {
  const q = query.trim().slice(0, 200);
  if (!q) return [];
  for (const method of methodsFor(id)) {
    try {
      const results = await method.search(q, lang);
      if (results.length) return results;
    } catch (error) {
      console.warn(`source ${id} via ${method.kind} failed:`, (error as Error).message);
    }
  }
  return [];
}

/** البحث في عدة مصادر معاً (بالتوازي)، مع مهلة إجمالية: ما لم يصل في الوقت يُترك. */
export async function searchMany(
  ids: SourceId[],
  query: string,
  lang: string,
  timeoutMs = 10_000,
): Promise<SourceResult[]> {
  const settled = await Promise.all(
    ids.map((id) =>
      Promise.race([
        search(id, query, lang),
        new Promise<SourceResult[]>((resolve) => setTimeout(() => resolve([]), timeoutMs)),
      ]),
    ),
  );
  return settled.flat();
}

/** المصادر التي لها موصّل بحث فعلي. */
export function searchableSources(): SourceDef[] {
  return SOURCES.filter((s) => methodsFor(s.id).length > 0);
}

// ---------------------------------------------------------------------------
// الحالة (لـ /api/health)
// ---------------------------------------------------------------------------

export type MethodHealth = {
  kind: AccessKind;
  via: string;
  status: Exclude<SourceStatus, "link_only">;
  results: number;
  latencyMs: number;
  error?: string;
  sample?: { title: string; url: string; grade?: string };
};

export type SourceHealth = {
  id: SourceId;
  name: string;
  url: string;
  domain: string;
  rule: string;
  access: AccessKind[];
  status: SourceStatus;
  methods: MethodHealth[];
  note?: string;
};

/** كلمة اختبار لكل مصدر (تناسب محتواه). */
function probeFor(id: SourceId): { query: string; lang: string } {
  if (id === "quranenc") return { query: "الحمد لله رب العالمين 1:2", lang: "ar" };
  if (id === "mp3quran") return { query: "العفاسي", lang: "ar" };
  if (id === "terminologyenc" || id === "jamhara") return { query: "التوحيد", lang: "ar" };
  if (id === "dorar_history") return { query: "غزوة بدر", lang: "ar" };
  if (id === "dorar_tafseer" || id === "tafsir_net") return { query: "الفاتحة", lang: "ar" };
  return { query: "الصلاة", lang: "ar" };
}

async function checkMethod(id: SourceId, index: number): Promise<MethodHealth> {
  const method = methodsFor(id)[index];
  const { query, lang } = probeFor(id);
  const started = Date.now();
  try {
    const results = await method.search(query, lang);
    const first = results[0];
    return {
      kind: method.kind,
      via: method.via,
      status: "ok",
      results: results.length,
      latencyMs: Date.now() - started,
      ...(first ? { sample: { title: first.title, url: first.url, ...(first.grade ? { grade: first.grade } : {}) } } : {}),
    };
  } catch (error) {
    return {
      kind: method.kind,
      via: method.via,
      status: error instanceof BlockedError ? "blocked" : "down",
      results: 0,
      latencyMs: Date.now() - started,
      error: String((error as Error)?.message ?? error).slice(0, 160),
    };
  }
}

/** لمصدر «رابط فقط»: هل الموقع يفتح ويسمح robots.txt بصفحته الرئيسية؟ */
async function checkLink(def: SourceDef): Promise<MethodHealth> {
  const started = Date.now();
  try {
    await politeFetch(def.url, { respectRobots: true });
    return { kind: "site", via: def.url.replace(/^https?:\/\//, ""), status: "ok", results: 0, latencyMs: Date.now() - started };
  } catch (error) {
    return {
      kind: "site",
      via: def.url.replace(/^https?:\/\//, ""),
      status: error instanceof BlockedError ? "blocked" : "down",
      results: 0,
      latencyMs: Date.now() - started,
      error: String((error as Error)?.message ?? error).slice(0, 160),
    };
  }
}

/**
 * حالة المصدر: «يعمل» إن نجحت طريقة واحدة على الأقل بنتائج، و«محجوب» إن لم تنجح أي طريقة
 * وكان منها ما منعه الموقع أو robots.txt، وإلا «لا يعمل». ومصدر «رابط فقط» يُفحص وصوله.
 */
export async function sourceHealth(def: SourceDef): Promise<SourceHealth> {
  const base = {
    id: def.id,
    name: def.name,
    url: def.url,
    domain: def.domain,
    rule: def.rule,
    access: def.access,
    note: def.note,
  };
  const methods = methodsFor(def.id);
  if (!methods.length) {
    const link = await checkLink(def);
    return { ...base, status: link.status === "ok" ? "link_only" : link.status, methods: [link] };
  }

  // طرق المصدر الواحد بالتتابع (إيقاع مؤدب)، والمصادر المختلفة بالتوازي.
  const results: MethodHealth[] = [];
  for (let i = 0; i < methods.length; i++) results.push(await checkMethod(def.id, i));

  let status: SourceStatus = "down";
  if (results.some((m) => m.status === "ok" && m.results > 0)) status = "ok";
  else if (results.some((m) => m.status === "blocked")) status = "blocked";
  else if (results.some((m) => m.status === "ok")) status = "ok";
  return { ...base, status, methods: results };
}

export function allSourcesHealth(): Promise<SourceHealth[]> {
  return Promise.all(SOURCES.map((def) => sourceHealth(def)));
}


/**
 * تشخيص صيغة صفحة البحث (/api/health?debug=1): أول الروابط في صفحة نتائج الموقع،
 * لضبط نمط الروابط في connectors.ts. لا تُحفظ الصفحة.
 */
export async function debugSiteSearch(id: SourceId): Promise<{ url: string; links: string[]; error?: string } | null> {
  const method = methodsFor(id).find((m) => m.kind === "site" && m.pageUrl);
  if (!method?.pageUrl) return null;
  const { query, lang } = probeFor(id);
  const url = method.pageUrl(query, lang);
  try {
    const { text, finalUrl } = await politeFetch(url, { respectRobots: true });
    return { url: finalUrl, links: sampleLinks(text, finalUrl, 15) };
  } catch (error) {
    return { url, links: [], error: String((error as Error)?.message ?? error).slice(0, 160) };
  }
}
