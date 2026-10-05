import "server-only";

import { cached, DAY } from "@/lib/cache";
import { clip, htmlToText } from "./html";
import { politeJson } from "./polite-fetch";
import type { FatwaMeta, SourceResult } from "./types";

/**
 * Quranpedia: واجهة API عامة بلا مفتاح (https://api.quranpedia.net/v1)، حدها 120 طلباً في الدقيقة
 * و10000 في اليوم لكل IP. منها:
 *   GET /search/{q}/fatwas           ← فتاوى منشورة كاملة (ar_title، ar_question، ar_answer، mufti، ar_source_url…)
 *   GET /search/{q}/{books|topics}   ← كتب وموضوعات
 *   GET /ayah/{s}/{a}/options        ← كتب التفسير المتاحة للآية
 *   GET /ayah/{s}/{a}/book/{id}      ← تفسير الآية من كتاب
 *   GET /translations/{s}/{a}/{lang} ← ترجمة معنى الآية
 *
 * شرط إلزامي: لا تُقبل فتوى إلا إن كان نطاق رابطها الأصلي من المرجعية (FATWA_DOMAINS). وكل نطاق
 * غيره (مثل islamway.net) يُستبعد دائماً. بيئة التطوير لا تصل إلى الإنترنت، فالقراءة دفاعية:
 * الحقول تُلتقط من أي عمق وبأسماء بديلة، والناقص منها لا يُسقط الرد كله.
 * الطلبات عبر politeFetch: مهلة 8 ثوانٍ، وUser-Agent باسم mustafti.com، ونطاقات المرجعية فقط.
 */

export const QURANPEDIA_API = "https://api.quranpedia.net/v1";
export const QURANPEDIA_NAME = "موسوعة القرآن (Quranpedia)";
/** 120 طلباً في الدقيقة = طلب كل نصف ثانية. */
const INTERVAL_MS = 500;
const MAX = 8;

/** نطاقات الفتاوى المسموحة (من المرجعية)، والنطاقات الفرعية لها. */
export const FATWA_DOMAINS = ["islamqa.info", "binbaz.org.sa", "binothaimeen.net", "islamhouse.com", "dorar.net"] as const;

/** اسم الجهة من النطاق، حين لا يذكر الرد اسم المفتي. */
const DOMAIN_NAMES: Record<(typeof FATWA_DOMAINS)[number], string> = {
  "islamqa.info": "الإسلام سؤال وجواب",
  "binbaz.org.sa": "موقع الشيخ عبدالعزيز بن باز",
  "binothaimeen.net": "موقع الشيخ محمد بن صالح العثيمين",
  "islamhouse.com": "موقع دار الإسلام (IslamHouse)",
  "dorar.net": "الدرر السنية",
};

/** نطاق المرجعية للرابط (islamqa.info…)، أو null لأي نطاق آخر أو رابط غير صالح. */
export function referenceFatwaDomain(url: string | undefined): (typeof FATWA_DOMAINS)[number] | null {
  if (!url) return null;
  let host: string;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    host = u.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
  return FATWA_DOMAINS.find((d) => host === d || host.endsWith(`.${d}`)) ?? null;
}

export function isReferenceFatwaUrl(url: string | undefined): boolean {
  return referenceFatwaDomain(url) !== null;
}

// ---------------------------------------------------------------------------
// القراءة الدفاعية
// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>;

/** قيمة نصية: نص، أو رقم، أو كائن فيه اسم (المفتي أو التصنيف قد يأتيان كائنين). */
export function textOf(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Obj;
    for (const k of ["ar_name", "name", "ar_title", "title", "full_name", "label"]) {
      const s = textOf(o[k]);
      if (s) return s;
    }
  }
  return undefined;
}

function first(o: Obj, keys: string[]): string | undefined {
  for (const k of keys) {
    const s = textOf(o[k]);
    if (s) return s;
  }
  return undefined;
}

/** كل كائن يحقق الشرط، في أي عمق (الرد قد يكون مصفوفة، أو {data:[…]}، أو {data:{data:[…]}}). */
export function collectObjects(data: unknown, match: (o: Obj) => boolean, max = 50): Obj[] {
  const out: Obj[] = [];
  const visit = (node: unknown, depth: number) => {
    if (out.length >= max || depth > 6 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const n of node) visit(n, depth + 1);
      return;
    }
    const o = node as Obj;
    if (match(o)) {
      out.push(o);
      return;
    }
    for (const v of Object.values(o)) if (v && typeof v === "object") visit(v, depth + 1);
  };
  visit(data, 0);
  return out;
}

const plain = (s: string | undefined) => (s ? htmlToText(s) : "");

// ---------------------------------------------------------------------------
// الفتاوى
// ---------------------------------------------------------------------------

export type PublishedFatwa = FatwaMeta & { id: string; title: string; url: string };

const FATWA_KEYS = ["ar_answer", "ar_question", "ar_title"];

/**
 * يحلل رد /search/{q}/fatwas. يبقي الفتوى فقط إن كان لها جواب ورابط أصلي من نطاقات المرجعية.
 * الحقول الناقصة: العنوان من السؤال، والسؤال من العنوان، والمفتي من اسم الجهة.
 */
export function parseFatwas(data: unknown, max = MAX): PublishedFatwa[] {
  const out: PublishedFatwa[] = [];
  const seen = new Set<string>();
  for (const o of collectObjects(data, (x) => FATWA_KEYS.some((k) => k in x), 100)) {
    if (out.length >= max) break;
    const url = first(o, ["ar_source_url", "source_url", "sourceUrl", "url", "link"]);
    const domain = referenceFatwaDomain(url);
    if (!url || !domain) continue;
    const answer = plain(first(o, ["ar_answer", "answer", "ar_text", "text"]));
    if (answer.length < 20) continue;
    const question = plain(first(o, ["ar_question", "question"]));
    const title = plain(first(o, ["ar_title", "title"])) || clip(question, 140);
    if (!title) continue;
    const key = url.replace(/[#?].*$/, "").replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    const category = plain(textOf(o.category) ?? textOf(o.ar_category));
    out.push({
      id: first(o, ["id", "fatwa_id"]) ?? key,
      title: clip(title, 200),
      question: clip(question || title, 1500),
      answer: clip(answer, 6000),
      mufti: clip(plain(textOf(o.mufti) ?? first(o, ["ar_mufti", "mufti_name", "scholar", "author"])) || DOMAIN_NAMES[domain], 120),
      ...(category ? { category: clip(category, 120) } : {}),
      url: url.trim(),
      host: domain,
    });
  }
  return out;
}

const enc = encodeURIComponent;

function api<T = unknown>(path: string): Promise<T> {
  return politeJson<T>(`${QURANPEDIA_API}${path}`, { minIntervalMs: INTERVAL_MS });
}

/** نطاقات الفتاوى المستبعدة في رد (لصفحة الفحص: للتحقق من الفلتر حياً). */
export function excludedFatwaHosts(data: unknown): string[] {
  const hosts = new Set<string>();
  for (const o of collectObjects(data, (x) => FATWA_KEYS.some((k) => k in x), 100)) {
    const url = first(o, ["ar_source_url", "source_url", "sourceUrl", "url", "link"]);
    if (referenceFatwaDomain(url)) continue;
    try {
      hosts.add(url ? new URL(url).hostname : "(بلا رابط)");
    } catch {
      hosts.add("(رابط غير صالح)");
    }
  }
  return [...hosts];
}

/** الطلب نفسه بلا ذاكرة (لصفحة الفحص). */
export async function fetchFatwas(query: string): Promise<{ fatwas: PublishedFatwa[]; excluded: string[]; shape: string[] }> {
  const data = await api(`/search/${enc(query.trim().slice(0, 120))}/fatwas`);
  return { fatwas: parseFatwas(data), excluded: excludedFatwaHosts(data), shape: shapeOf(data) };
}

/** فتاوى منشورة لعبارة بحث (مخزّنة 24 ساعة؛ الفشل يُرمى فلا يُخزَّن). */
export function searchFatwas(query: string): Promise<PublishedFatwa[]> {
  const q = query.trim().slice(0, 120);
  if (!q) return Promise.resolve([]);
  return cached(`qp:fatwas:${q}`, DAY, async () => parseFatwas(await api(`/search/${enc(q)}/fatwas`)));
}

/** الفتوى بالواجهة الموحدة: النص سؤالها ثم جوابها (للتقييم والصياغة)، ومعها بياناتها كاملة. */
export function fatwaResult(f: PublishedFatwa): SourceResult {
  return {
    title: f.title,
    text: clip(`السؤال: ${f.question}\nالجواب: ${f.answer}`, 3000),
    url: f.url,
    source: `فتوى منشورة — ${f.mufti}`,
    sourceId: "quranpedia",
    lang: "ar",
    fatwa: { mufti: f.mufti, question: f.question, answer: f.answer, host: f.host, ...(f.category ? { category: f.category } : {}) },
  };
}

// ---------------------------------------------------------------------------
// الكتب والموضوعات
// ---------------------------------------------------------------------------

const NAME_KEYS = ["ar_title", "title", "ar_name", "name"];
const BODY_KEYS = ["ar_description", "description", "ar_text", "text", "content", "summary", "ar_summary", "brief"];

/** كتب أو موضوعات: العنوان والوصف والرابط (من الرد، وإلا صفحة المادة في الموقع بمعرّفها). */
export function parseItems(data: unknown, kind: "books" | "topics", max = MAX): SourceResult[] {
  const out: SourceResult[] = [];
  const seen = new Set<string>();
  // كائنات لها معرّف أولاً (لا غلاف الرد نفسه إن كان له عنوان)، وإلا كل كائن له عنوان.
  const named = (x: Obj) => NAME_KEYS.some((k) => typeof x[k] === "string");
  let objs = collectObjects(data, (x) => named(x) && (x.id !== undefined || x.slug !== undefined), 100);
  if (!objs.length) objs = collectObjects(data, named, 100);
  for (const o of objs) {
    if (out.length >= max) break;
    const title = plain(first(o, NAME_KEYS));
    if (title.length < 2) continue;
    const id = first(o, ["id", "slug"]);
    const given = first(o, ["url", "link", "ar_source_url", "source_url"]);
    const url = given && /^https?:\/\//.test(given) ? given : `https://quranpedia.net/${kind === "books" ? "book" : "topic"}/${id ? enc(id) : ""}`;
    if (seen.has(url)) continue;
    seen.add(url);
    const author = plain(textOf(o.author) ?? textOf(o.ar_author));
    const body = plain(first(o, BODY_KEYS));
    out.push({
      title: clip(title, 200),
      text: clip([body, author ? `المؤلف: ${author}` : ""].filter(Boolean).join("\n") || title, 1200),
      url,
      source: QURANPEDIA_NAME,
      sourceId: "quranpedia",
      lang: "ar",
    });
  }
  return out;
}

export async function fetchItems(query: string, kind: "books" | "topics"): Promise<{ items: SourceResult[]; shape: string[] }> {
  const data = await api(`/search/${enc(query.trim().slice(0, 120))}/${kind}`);
  return { items: parseItems(data, kind), shape: shapeOf(data) };
}

export function searchItems(query: string, kind: "books" | "topics"): Promise<SourceResult[]> {
  const q = query.trim().slice(0, 120);
  if (!q) return Promise.resolve([]);
  return cached(`qp:${kind}:${q}`, DAY, async () => (await fetchItems(q, kind)).items);
}

// ---------------------------------------------------------------------------
// التفسير والترجمة
// ---------------------------------------------------------------------------

/** كتب التفسير المفضلة بالترتيب (إن وُجدت في خيارات الآية). */
const PREFERRED_TAFSIR = [/الميسر/, /السعدي/, /ابن كثير/, /الطبري/, /البغوي/, /القرطبي/];

export type TafsirOption = { id: string; name: string };

/** خيارات /ayah/{s}/{a}/options: كل كائن فيه معرّف واسم. */
export function parseOptions(data: unknown): TafsirOption[] {
  const out: TafsirOption[] = [];
  for (const o of collectObjects(data, (x) => (x.id !== undefined || x.book_id !== undefined) && NAME_KEYS.some((k) => textOf(x[k])), 200)) {
    const id = first(o, ["book_id", "id"]);
    const name = plain(first(o, NAME_KEYS));
    if (id && name && !out.some((x) => x.id === id)) out.push({ id, name });
  }
  return out;
}

export function pickTafsir(options: TafsirOption[]): TafsirOption | undefined {
  for (const re of PREFERRED_TAFSIR) {
    const hit = options.find((o) => re.test(o.name));
    if (hit) return hit;
  }
  return options.find((o) => /تفسير|التفسير/.test(o.name)) ?? options[0];
}

/** أطول نص في الرد (التفسير قد يأتي في text أو content أو nass…). */
export function longestText(data: unknown): string {
  let best = "";
  const visit = (node: unknown, depth: number) => {
    if (depth > 6 || node === null || node === undefined) return;
    if (typeof node === "string") {
      if (node.length > best.length) best = node;
      return;
    }
    if (typeof node !== "object") return;
    for (const v of Array.isArray(node) ? node : Object.values(node as Obj)) visit(v, depth + 1);
  };
  visit(data, 0);
  return plain(best);
}

/** تفسير آية من أفضل كتاب متاح لها (مخزّن 24 ساعة). [] إن لم يوجد. */
export function ayahTafsir(surah: number, ayah: number): Promise<SourceResult[]> {
  return cached(`qp:tafsir:${surah}:${ayah}`, DAY, () => fetchAyahTafsir(surah, ayah));
}

/** التفسير بلا ذاكرة: خيارات الآية، ثم نص أفضل كتاب. */
export async function fetchAyahTafsir(surah: number, ayah: number): Promise<SourceResult[]> {
  const book = pickTafsir(parseOptions(await api(`/ayah/${surah}/${ayah}/options`)));
  if (!book) return [];
  const text = longestText(await api(`/ayah/${surah}/${ayah}/book/${enc(book.id)}`));
  if (text.length < 20) return [];
  return [
    {
      title: `${book.name} — ${surah}:${ayah}`,
      text: clip(text, 2000),
      url: `https://quranpedia.net/book/${enc(book.id)}`,
      source: `${QURANPEDIA_NAME} — ${book.name}`,
      sourceId: "quranpedia" as const,
      lang: "ar",
    },
  ];
}

/** ترجمة معنى آية بلغة السائل (مخزّنة 24 ساعة). */
export function ayahTranslation(surah: number, ayah: number, lang: string): Promise<SourceResult[]> {
  const l = lang.toLowerCase().slice(0, 5);
  return cached(`qp:translation:${surah}:${ayah}:${l}`, DAY, () => fetchAyahTranslation(surah, ayah, l));
}

export async function fetchAyahTranslation(surah: number, ayah: number, lang: string): Promise<SourceResult[]> {
  const l = lang.toLowerCase().slice(0, 5);
  const text = longestText(await api(`/translations/${surah}/${ayah}/${enc(l)}`));
  if (text.length < 5) return [];
  return [
    {
      title: `${QURANPEDIA_NAME} — ${surah}:${ayah} (${l})`,
      text: clip(text, 1500),
      url: `https://quranpedia.net/`,
      source: QURANPEDIA_NAME,
      sourceId: "quranpedia" as const,
      lang: l,
    },
  ];
}

/** مفاتيح أول كائن في الرد (لصفحة الفحص: لضبط القراءة إن اختلفت أسماء الحقول). */
export function shapeOf(data: unknown): string[] {
  const o = collectObjects(data, (x) => Object.keys(x).length > 2, 1)[0];
  return o ? Object.keys(o).slice(0, 30) : [];
}

/** الرد الخام لمسار (لصفحة الفحص فقط، بلا تخزين). */
export function rawQuranpedia(path: string): Promise<unknown> {
  return api(path);
}
