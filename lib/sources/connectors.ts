import "server-only";

import { after } from "next/server";
import { cached, DAY } from "@/lib/cache";
import { clip, embeddedJson, extractResultLinks, linksFromJson, openSearchHref, searchForms, type ExtractedLink } from "./html";
import { searchBayyinat } from "./bayyinat";
import { collectItems, mcpFetchHadith, mcpLibrary, mcpQuranVerses, mcpSearch, type McpCorpus, type McpItem } from "./mcp-search";
import { politeFetch, politeJson } from "./polite-fetch";
import { QURANENC_TRANSLATIONS } from "./quran";
import { SOURCE_BY_ID } from "./registry";
import type { AccessMethod, SourceId, SourceResult } from "./types";

/**
 * موصّلات المصادر: لكل مصدر قائمة طرق وصول بالترتيب (MCP ← API ← الموقع).
 * كل طريقة تعيد SourceResult[] أو ترمي خطأ. نتائج API والموقع تُخزَّن 24 ساعة
 * (المقتطفات والروابط فقط)، ونتائج MCP تُخزَّن في lib/mcp.ts.
 * المواقع التي تحجبنا (403) أو يمنعنا robots.txt من بحثها ليست هنا: هي «رابط فقط» في registry.ts.
 */

const MAX_RESULTS = 5;

function siteLang(id: SourceId, lang: string): string {
  const langs = SOURCE_BY_ID[id].langs;
  if (!langs) return lang;
  return langs.includes(lang) ? lang : "ar";
}

function toResults(id: SourceId, items: McpItem[], lang: string): SourceResult[] {
  return items.slice(0, MAX_RESULTS).map((item) => ({
    title: item.title,
    text: item.text,
    url: item.url,
    source: SOURCE_BY_ID[id].name,
    sourceId: id,
    ...(item.grade ? { grade: item.grade } : {}),
    ...(item.ref ? { ref: item.ref } : {}),
    lang: item.lang ?? lang,
  }));
}

/** رقم آية مذكور في السؤال (مثل 2:255). */
export function verseRef(query: string): { surah: number; ayah: number } | null {
  const m = query.match(/(\d{1,3})\s*[:：]\s*(\d{1,3})/);
  if (!m) return null;
  const [surah, ayah] = [Number(m[1]), Number(m[2])];
  return surah >= 1 && surah <= 114 && ayah >= 1 ? { surah, ayah } : null;
}

// ---------------------------------------------------------------------------
// خادم MCP: الأدوات المتخصصة أولاً (أسرع)، ثم البحث في مجموعة واحدة
// ---------------------------------------------------------------------------

function mcpCorpus(id: SourceId, corpus: McpCorpus): AccessMethod {
  return {
    kind: "mcp",
    via: `MCP: search (sources=${corpus})`,
    search: async (query, lang) => toResults(id, await mcpSearch(query, lang, corpus), lang),
  };
}

const quranVerses: AccessMethod = {
  kind: "mcp",
  via: "MCP: get_quran_verses",
  search: async (query, lang) => {
    const ref = verseRef(query);
    return ref ? toResults("quranenc", await mcpQuranVerses(ref.surah, ref.ayah, lang), lang) : [];
  },
};

const libraryTitles: AccessMethod = {
  kind: "mcp",
  via: "MCP: browse_library (name)",
  search: async (query, lang) => toResults("islamhouse", await mcpLibrary(query, lang), lang),
};

/**
 * الحديث: لا يُعرض حديث دون درجته. بعد البحث يُجلب لكل نتيجة نصها الكامل ودرجتها بأداة fetch
 * بمعرّفها (بالتوازي، ومخزّنة 24 ساعة في lib/mcp.ts)، وكل حديث لم تأتِ درجته يُحذف.
 */
const hadithWithGrade: AccessMethod = {
  kind: "mcp",
  via: "MCP: search (sources=hadith) + fetch",
  search: async (query, lang) => {
    const items = (await mcpSearch(query, lang, "hadith")).slice(0, MAX_RESULTS);
    const full = await Promise.all(
      items.map(async (item) => {
        const got = item.ref ? await mcpFetchHadith(item.ref).catch(() => null) : null;
        const grade = got?.grade ?? item.grade;
        if (!grade) return null;
        return { ...item, grade, text: got?.text || item.text, url: got?.url ?? item.url };
      }),
    );
    return toResults("hadeethenc", full.filter((x): x is McpItem & { grade: string } => x !== null), lang);
  },
};

/** «بيّنات»: فهرس محلي في Supabase (بحث نصي)، ويُتجاهل بصمت إن كان الجدول فارغاً. */
const bayyinatDb: AccessMethod = {
  kind: "db",
  via: "Supabase: bayyinat (fts)",
  search: (query, lang) => searchBayyinat(query, lang),
};

// ---------------------------------------------------------------------------
// البحث المباشر في الموقع
// ---------------------------------------------------------------------------

type SiteOptions = {
  /** رابط صفحة المادة من معرّفها، لنتائج مضمّنة في الصفحة بصيغة JSON بلا رابط. */
  idUrl?: (id: string, lang: string) => string;
  /** الصفحة التي يُكتشف منها نموذج البحث (الصفحة الرئيسية للغة). */
  home?: (lang: string) => string;
};

/**
 * يكتشف صيغة البحث الصحيحة من الموقع نفسه: وصف OpenSearch إن أعلنه، وإلا نموذج البحث
 * في الصفحة الرئيسية. يُخزَّن 24 ساعة. يعيد قالباً فيه {q} أو null.
 */
function discoverTemplate(homeUrl: string): Promise<string | null> {
  return cached(`discover:${homeUrl}`, DAY, async () => {
    const { text, finalUrl } = await politeFetch(homeUrl, { respectRobots: true });
    const osd = openSearchHref(text, finalUrl);
    if (osd) {
      try {
        const xml = (await politeFetch(osd, { respectRobots: true, accept: "application/opensearchdescription+xml" })).text;
        const tpl = xml.match(/<Url\b[^>]*type=["']text\/html["'][^>]*template=["']([^"']+)["']/i)?.[1]
          ?? xml.match(/<Url\b[^>]*template=["']([^"']+)["'][^>]*type=["']text\/html["']/i)?.[1];
        if (tpl) return tpl.replace(/&amp;/g, "&").replace("{searchTerms}", "{q}").replace(/\{[^}]+\?\}/g, "");
      } catch {
        /* نكمل بنموذج الصفحة */
      }
    }
    const form = searchForms(text, finalUrl)[0];
    if (!form) return null;
    const url = new URL(form.action);
    url.searchParams.set(form.field, "QUERY");
    return url.toString().replace("QUERY", "{q}");
  });
}

/** النتائج من HTML الصفحة: الروابط المطابقة، وإلا البيانات المضمّنة (للصفحات التي تُرسم بـ JavaScript). */
function extract(html: string, finalUrl: string, pattern: RegExp, idUrl?: (id: string) => string): ExtractedLink[] {
  const links = extractResultLinks(html, finalUrl, pattern, { limit: MAX_RESULTS });
  if (links.length) return links;
  for (const block of embeddedJson(html)) {
    const found = linksFromJson(block, finalUrl, idUrl, MAX_RESULTS).filter((l) => pattern.test(new URL(l.url).pathname));
    if (found.length) return found;
  }
  return [];
}

/** البحث المباشر في صفحة بحث الموقع، مع robots.txt وإيقاع طلب في الثانية. */
function site(
  id: SourceId,
  searchUrl: (query: string, lang: string) => string,
  linkPattern: RegExp,
  options: SiteOptions = {},
): AccessMethod {
  return {
    kind: "site",
    via: searchUrl("QUERY", "ar").replace("QUERY", "…").replace(/^https?:\/\//, ""),
    pageUrl: (query, lang) => searchUrl(query, siteLang(id, lang)),
    search: (query, lang) => {
      const l = siteLang(id, lang);
      const url = searchUrl(query, l);
      const idUrl = options.idUrl ? (x: string) => options.idUrl!(x, l) : undefined;
      return cached(`site:${url}`, DAY, async () => {
        const page = await politeFetch(url, { respectRobots: true });
        let links = extract(page.text, page.finalUrl, linkPattern, idUrl);
        // لا نتائج: نجرب صيغة البحث التي يعلنها الموقع نفسه (مرة في اليوم).
        if (!links.length && options.home) {
          const tpl = await discoverTemplate(options.home(l)).catch(() => null);
          const alt = tpl?.replace("{q}", encodeURIComponent(query));
          if (alt && alt !== url) {
            const second = await politeFetch(alt, { respectRobots: true });
            links = extract(second.text, second.finalUrl, linkPattern, idUrl);
          }
        }
        return links.map((link) => ({
          title: link.title,
          text: link.snippet,
          url: link.url,
          source: SOURCE_BY_ID[id].name,
          sourceId: id,
          lang: l,
        }));
      });
    },
  };
}

const q = encodeURIComponent;
/** نمط عام: مسار فيه معرّف رقمي (صفحة مادة لا صفحة قائمة). */
const NUMERIC_PATH = /\/\d{2,}(?:\/|$|[-_])/;

// ---------------------------------------------------------------------------
// واجهات API عامة بلا مفتاح
// ---------------------------------------------------------------------------

/** quranenc: ترجمة آية بعينها حين يذكر السؤال رقمها (مثل 2:255). */

const quranencApi: AccessMethod = {
  kind: "api",
  via: "quranenc.com/api/v1/translation/aya",
  search: async (query, lang) => {
    const ref = verseRef(query);
    if (!ref) return [];
    const { surah: sura, ayah: aya } = ref;
    const key = QURANENC_TRANSLATIONS[lang] ?? QURANENC_TRANSLATIONS.en;
    return cached(`api:quranenc:${key}:${sura}:${aya}`, DAY, async () => {
      const data = await politeJson<{ result?: { arabic_text?: string; translation?: string; footnotes?: string } }>(
        `https://quranenc.com/api/v1/translation/aya/${key}/${sura}/${aya}`,
      );
      const r = data.result;
      if (!r) return [];
      return [
        {
          title: `${SOURCE_BY_ID.quranenc.name} — ${sura}:${aya}`,
          text: clip([r.arabic_text, r.translation].filter(Boolean).join("\n"), 1200),
          url: `https://quranenc.com/${lang === "ar" ? "ar" : "en"}/browse/${key}/${sura}#${aya}`,
          source: SOURCE_BY_ID.quranenc.name,
          sourceId: "quranenc" as const,
          lang,
        },
      ];
    });
  },
};

/** رسالة الحرمين: واجهة البحث العامة. */
const risalaApi: AccessMethod = {
  kind: "api",
  via: "risala.prh.gov.sa/{lang}/Api/search?query=",
  search: (query, lang) =>
    cached(`api:risala:${lang}:${query}`, DAY, async () => {
      const l = lang === "ar" ? "ar" : lang;
      const data = await politeJson(`https://risala.prh.gov.sa/${l}/Api/search?query=${q(query)}&page=1`);
      return toResults("risala", collectItems(data, MAX_RESULTS, `https://risala.prh.gov.sa/${l}`), l);
    }),
};

/** المكتبة الصوتية: البحث في أسماء القرّاء (لزر «استمع للآية»). */
const mp3quranApi: AccessMethod = {
  kind: "api",
  via: "mp3quran.net/api/v3/reciters",
  search: async (query, lang) => {
    const l = ["ar", "en", "fr", "ru", "tr", "ur", "id", "fa", "bn", "ms", "sw", "ha"].includes(lang) ? lang : "en";
    const reciters = await cached(`api:mp3quran:reciters:${l}`, DAY, async () => {
      const data = await politeJson<{ reciters?: { id: number; name: string; moshaf?: { name: string; server: string }[] }[] }>(
        `https://mp3quran.net/api/v3/reciters?language=${l}`,
      );
      return (data.reciters ?? []).map((r) => ({ id: r.id, name: r.name, moshaf: (r.moshaf ?? []).map((m) => m.name) }));
    });
    const words = query.split(/\s+/).filter((w) => w.length > 2);
    return reciters
      .filter((r) => words.some((w) => r.name.includes(w)))
      .slice(0, MAX_RESULTS)
      .map((r) => ({
        title: r.name,
        text: r.moshaf.join(" · "),
        url: `https://mp3quran.net/${l}`,
        source: SOURCE_BY_ID.mp3quran.name,
        sourceId: "mp3quran" as const,
        lang: l,
      }));
  },
};

// ---------------------------------------------------------------------------
// خريطة الموصّلات (الترتيب = ترتيب المحاولة)
// ---------------------------------------------------------------------------

export const CONNECTORS: Partial<Record<SourceId, AccessMethod[]>> = {
  quranenc: [quranVerses, mcpCorpus("quranenc", "quran"), quranencApi],
  hadeethenc: [hadithWithGrade],
  bayyinat: [bayyinatDb],
  islamhouse: [libraryTitles, mcpCorpus("islamhouse", "library")],
  byenah: [site("byenah", (s, l) => `https://byenah.com/${l}/search?q=${q(s)}`, NUMERIC_PATH)],
  risala: [risalaApi],
  tafsir_net: [site("tafsir_net", (s) => `https://tafsir.net/search?q=${q(s)}`, NUMERIC_PATH)],
  mp3quran: [mp3quranApi],
  islamqa: [
    site("islamqa", (s, l) => `https://islamqa.info/${l}/search?q=${q(s)}`, /\/answers\/\d+/, {
      idUrl: (id, l) => `/${l}/answers/${id}`,
      home: (l) => `https://islamqa.info/${l}`,
    }),
  ],
  binbaz: [
    site("binbaz", (s) => `https://binbaz.org.sa/search?q=${q(s)}`, /^\/(fatwas|articles|audios|books|discussions|speeches)\/\d+/, {
      idUrl: (id) => `/fatwas/${id}`,
      home: () => "https://binbaz.org.sa/",
    }),
  ],
  binothaimeen: [
    site("binothaimeen", (s) => `https://binothaimeen.net/site/search?q=${q(s)}`, /\/content\/\d+/, {
      idUrl: (id) => `/content/${id}`,
      home: () => "https://binothaimeen.net/",
    }),
  ],
};

export function methodsFor(id: SourceId): AccessMethod[] {
  return CONNECTORS[id] ?? [];
}

// ---------------------------------------------------------------------------
// المهلة القصوى لكل مصدر
// ---------------------------------------------------------------------------

/**
 * يعيد نتيجة الوعد إن وصلت خلال ms، وإلا [] فوراً. الطلب لا يُلغى: يكمل في الخلفية
 * ويملأ الذاكرة المؤقتة، فيجد السؤال التالي النتيجة جاهزة. after() يُبقي الدالة حية
 * على Vercel حتى ينتهي (ويُتجاهل خارج سياق الطلب).
 */
export function withDeadline<T>(promise: Promise<T[]>, ms: number): Promise<T[]> {
  const settled = promise.catch(() => [] as T[]);
  try {
    after(() => settled);
  } catch {
    /* خارج طلب (سكربت أو اختبار) */
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    settled,
    new Promise<T[]>((resolve) => {
      timer = setTimeout(() => resolve([]), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
