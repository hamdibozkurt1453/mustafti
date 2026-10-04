import "server-only";

import { cached, DAY } from "@/lib/cache";
import { clip, extractResultLinks, htmlToText } from "./html";
import { collectItems, mcpSearchHost, type McpItem } from "./mcp-search";
import { politeFetch, politeJson } from "./polite-fetch";
import { SOURCE_BY_ID } from "./registry";
import type { AccessMethod, SourceId, SourceResult } from "./types";

/**
 * موصّلات المصادر: لكل مصدر قائمة طرق وصول بالترتيب (MCP ← API ← الموقع).
 * كل طريقة تعيد SourceResult[] أو ترمي خطأ. نتائج API والموقع تُخزَّن 24 ساعة
 * (المقتطفات والروابط فقط)، ونتائج MCP تُخزَّن في lib/mcp.ts.
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
    lang: item.lang ?? lang,
  }));
}

// ---------------------------------------------------------------------------
// قوالب الطرق
// ---------------------------------------------------------------------------

/** نتائج أداة search في خادم MCP التي يقع رابطها على نطاق المصدر. */
function mcp(id: SourceId, hosts: string[]): AccessMethod {
  return {
    kind: "mcp",
    via: "MCP: search",
    search: async (query, lang) => toResults(id, await mcpSearchHost(query, lang, hosts), lang),
  };
}

/** البحث المباشر في صفحة بحث الموقع، مع robots.txt وإيقاع طلب في الثانية. */
function site(
  id: SourceId,
  searchUrl: (query: string, lang: string) => string,
  linkPattern: RegExp,
): AccessMethod {
  return {
    kind: "site",
    via: searchUrl("…", "ar").replace(/^https?:\/\//, ""),
    pageUrl: (query, lang) => searchUrl(query, siteLang(id, lang)),
    search: (query, lang) => {
      const l = siteLang(id, lang);
      const url = searchUrl(query, l);
      return cached(`site:${url}`, DAY, async () => {
        const { text, finalUrl } = await politeFetch(url, { respectRobots: true });
        const links = extractResultLinks(text, finalUrl, linkPattern, { limit: MAX_RESULTS });
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
// موصّلات خاصة (API)
// ---------------------------------------------------------------------------

/** quranenc: ترجمة آية بعينها حين يذكر السؤال رقمها (مثل 2:255). */
const QURANENC_TRANSLATIONS: Record<string, string> = {
  ar: "arabic_moyassar",
  en: "english_saheeh",
  fr: "french_montada",
  tr: "turkish_shaban",
  ur: "urdu_junagarhi",
  id: "indonesian_affairs",
  bn: "bengali_zakaria",
  ru: "russian_kuliev",
  fa: "persian_ih",
  ms: "malay_basumayyah",
  sw: "swahili_barawani",
  ha: "hausa_gummi",
};

const quranencApi: AccessMethod = {
  kind: "api",
  via: "quranenc.com/api/v1/translation/aya",
  search: async (query, lang) => {
    const ref = query.match(/(\d{1,3})\s*[:：]\s*(\d{1,3})/);
    if (!ref) return [];
    const [sura, aya] = [Number(ref[1]), Number(ref[2])];
    if (sura < 1 || sura > 114 || aya < 1) return [];
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

/** الدرر: واجهة البحث الحديثي العامة (dorar.net/article/389)، وتعيد حكم المحدث. */
const dorarHadithApi: AccessMethod = {
  kind: "api",
  via: "dorar.net/dorar_api.json?skey=",
  search: (query) =>
    cached(`api:dorar:${query}`, DAY, async () => {
      const data = await politeJson<{ ahadith?: { result?: string } }>(
        `https://dorar.net/dorar_api.json?skey=${q(query)}`,
      );
      const html = data.ahadith?.result ?? "";
      const searchUrl = `https://dorar.net/hadith/search?q=${q(query)}`;
      const results: SourceResult[] = [];
      for (const block of html.split(/<div[^>]*class="hadith"[^>]*>/i).slice(1)) {
        const [hadithHtml, infoHtml = ""] = block.split(/<div[^>]*class="hadith-info"[^>]*>/i);
        const text = htmlToText(hadithHtml).replace(/^\d+\s*-\s*/, "");
        const info = htmlToText(infoHtml);
        const field = (label: string) =>
          info.match(new RegExp(`${label}\\s*:?\\s*(.+?)(?=\\s+(?:الراوي|المحدث|المصدر|الصفحة أو الرقم|خلاصة حكم المحدث)\\s*:|$)`))?.[1]?.trim();
        const grade = field("خلاصة حكم المحدث")?.replace(/[[\]]/g, "");
        const muhaddith = field("المحدث");
        const book = field("المصدر");
        if (!text) continue;
        results.push({
          title: [book, muhaddith].filter(Boolean).join(" — ") || SOURCE_BY_ID.dorar_hadith.name,
          text: clip(text, 700),
          url: searchUrl,
          source: SOURCE_BY_ID.dorar_hadith.name,
          sourceId: "dorar_hadith",
          ...(grade ? { grade } : {}),
          lang: "ar",
        });
        if (results.length >= MAX_RESULTS) break;
      }
      return results;
    }),
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
  quranenc: [mcp("quranenc", ["quranenc.com"]), quranencApi],
  hadeethenc: [
    mcp("hadeethenc", ["hadeethenc.com"]),
    site("hadeethenc", (s, l) => `https://hadeethenc.com/${l}/search?q=${q(s)}`, /\/browse\/hadith\/\d+/),
  ],
  byenah: [
    mcp("byenah", ["byenah.com"]),
    site("byenah", (s, l) => `https://byenah.com/${l}/search?q=${q(s)}`, NUMERIC_PATH),
  ],
  islamhouse: [
    mcp("islamhouse", ["islamhouse.com"]),
    site("islamhouse", (s, l) => `https://islamhouse.com/${l}/search/?q=${q(s)}`, /\/(books|articles|fatwa|audios|videos|poster|khotab)\/\d+/),
  ],
  islamenc: [
    mcp("islamenc", ["islamenc.com"]),
    site("islamenc", (s, l) => `https://islamenc.com/${l}/search?q=${q(s)}`, NUMERIC_PATH),
  ],
  terminologyenc: [
    mcp("terminologyenc", ["terminologyenc.com"]),
    site("terminologyenc", (s, l) => `https://terminologyenc.com/${l}/search?q=${q(s)}`, /\/browse\/term\/\d+|\/\d{2,}/),
  ],
  risala: [risalaApi],
  dawa_center: [site("dawa_center", (s) => `https://dawa.center/search?q=${q(s)}`, NUMERIC_PATH)],
  jamhara: [site("jamhara", (s) => `https://islamic-content.com/search?q=${q(s)}`, NUMERIC_PATH)],
  quranpedia: [site("quranpedia", (s) => `https://quranpedia.net/search?q=${q(s)}`, NUMERIC_PATH)],
  dorar_hadith: [dorarHadithApi],
  dorar_tafseer: [site("dorar_tafseer", (s) => `https://dorar.net/tafseer/search?q=${q(s)}`, /^\/tafseer\/\d+/)],
  dorar_aqeeda: [site("dorar_aqeeda", (s) => `https://dorar.net/aqeeda/search?q=${q(s)}`, /^\/aqeeda\/\d+/)],
  dorar_feqhia: [site("dorar_feqhia", (s) => `https://dorar.net/feqhia/search?q=${q(s)}`, /^\/feqhia\/\d+/)],
  dorar_history: [site("dorar_history", (s) => `https://dorar.net/history/search?q=${q(s)}`, /^\/history\/(event\/)?\d+/)],
  shamela: [site("shamela", (s) => `https://shamela.ws/search?q=${q(s)}`, /^\/book\/\d+/)],
  tafsir_net: [site("tafsir_net", (s) => `https://tafsir.net/search?q=${q(s)}`, NUMERIC_PATH)],
  mp3quran: [mp3quranApi],
  islamqa: [site("islamqa", (s, l) => `https://islamqa.info/${l}/search?q=${q(s)}`, /\/answers\/\d+/)],
  binbaz: [site("binbaz", (s) => `https://binbaz.org.sa/search?q=${q(s)}`, /^\/(fatwas|articles|audios|books|discussions)\/\d+/)],
  binothaimeen: [site("binothaimeen", (s) => `https://binothaimeen.net/site/search?q=${q(s)}`, /\/content\/\d+/)],
};

export function methodsFor(id: SourceId): AccessMethod[] {
  return CONNECTORS[id] ?? [];
}
