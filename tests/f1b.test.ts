/**
 * اختبارات F1b — المكتبة عبر الواجهة البرمجية الرسمية لـ IslamHouse، وصفحتا about وprivacy (بلا شبكة):
 *   تحويل الاستجابة إلى بطاقات، وربط التصنيفات بالشجرة، والفلترة المحلية، ومهلة الطلب، والمحتوى.
 *   npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { locales } from "../i18n/locales";
import {
  apiBase,
  fetchJson,
  filterBooks,
  flattenTree,
  ISLAMHOUSE_PUBLIC_KEY,
  ISLAMHOUSE_TIMEOUT_MS,
  IslamhouseError,
  isTopicKey,
  LIBRARY_TOPIC_DEFS,
  LIBRARY_TOPIC_KEYS,
  normalizeForSearch,
  paths,
  resolveTopicIds,
  toBookCard,
  toBookCards,
} from "../lib/library/islamhouse-core";
import { PAGE_CONTENT, REPO_URL } from "../lib/pages/content";
import { CONTACT_EMAIL, PRIVACY, PRIVACY_UPDATED } from "../lib/pages/privacy";

type Json = { [key: string]: string | Json };
const messages = Object.fromEntries(
  locales.map((l) => [l, JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), "utf8")) as Json]),
) as Record<string, Json>;
const get = (obj: Json, path: string): unknown => path.split(".").reduce<unknown>((o, k) => (o as Json | undefined)?.[k], obj);
const src = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** عيّنة بشكل استجابة main/books (data[] بالحقول الموثّقة). */
const BOOKS = {
  data: [
    {
      id: 2829312,
      title: "<b>الأصول الثلاثة</b> وأدلتها",
      type: "books",
      description: "<p>رسالة مختصرة في معرفة العبد ربه ودينه ونبيه&nbsp;صلى الله عليه وسلم.</p>",
      prepared_by: [
        { id: 1, title: "محمد بن عبد الوهاب", kind: "author" },
        { id: 2, title: "مراجع", kind: "reviser" },
      ],
      attachments: [
        { url: "https://d1.islamhouse.com/data/ar/ih_books/single/ar_usool.doc", extension_type: "DOC", size: "120 KB" },
        { url: "https://d1.islamhouse.com/data/ar/ih_books/single/ar_usool.pdf", extension_type: "PDF", size: "350 KB" },
      ],
      image: "https://d1.islamhouse.com/data/ar/ih_books/single/ar_usool.jpg",
    },
    {
      id: 77,
      title: "صفة صلاة النبي",
      description: "شرح صفة الصلاة من التكبير إلى التسليم بالدليل.",
      prepared_by: [{ title: "عبد العزيز بن باز" }],
      attachments: [{ url: "http://d1.islamhouse.com/data/ar/salah.pdf", extension_type: "pdf", size: "1 MB" }],
      image: "",
    },
    { id: 78, title: "مقال ليس كتاباً", type: "articles", attachments: [] },
    { id: 0, title: "بلا معرّف" },
    { id: 79, title: "" },
    { id: 2829312, title: "مكرر" },
    { id: 80, title: "رمضان شهر الصيام", description: "أحكام الصيام وآدابه", attachments: [{ url: "javascript:alert(1)", extension_type: "PDF" }] },
  ],
};

/** عيّنة شجرة تصنيفات (الفروع تحت sub). */
const TREE = {
  data: [
    { id: 86219, title: "القرآن الكريم", sub: [{ id: 728011, title: "التفسير" }] },
    { id: 132381, title: "السنة", sub: [{ id: 144409, title: "كتب السنة" }] },
    { id: 192525, title: "العقيدة" },
    {
      id: 5000,
      title: "الفقه",
      sub: [
        { id: 5001, title: "العبادات", sub: [{ id: 5002, title: "الصلاة" }, { id: 5003, title: "الصيام" }, { id: 5009, title: "صلاة الجمعة" }] },
        { id: 5004, title: "الأسرة", sub: [{ id: 5005, title: "الزواج" }] },
      ],
    },
    { id: 6000, title: "السيرة النبوية" },
    { id: 7000, title: "الدعوة إلى الله", sub: [{ id: 7001, title: "دعوة المسلمين الجدد" }] },
    { id: 8000, title: "الأخلاق والآداب" },
  ],
};

describe("F1b · تحويل استجابة IslamHouse إلى بطاقات", () => {
  const cards = toBookCards(BOOKS, "ar");

  it("الكتب وحدها، بمعرّف وعنوان، بلا تكرار", () => {
    assert.deepEqual(cards.map((c) => c.id), [2829312, 77, 80]);
  });

  it("العنوان والوصف بلا HTML، والمؤلف من prepared_by (المؤلف أولاً)", () => {
    const [c] = cards;
    assert.equal(c.title, "الأصول الثلاثة وأدلتها");
    assert.equal(c.description, "رسالة مختصرة في معرفة العبد ربه ودينه ونبيه صلى الله عليه وسلم.");
    assert.equal(c.author, "محمد بن عبد الوهاب");
    assert.equal(cards[1].author, "عبد العزيز بن باز");
  });

  it("أول ملف PDF، والصفحة الرسمية، والغلاف", () => {
    const [c, salah, siyam] = cards;
    assert.deepEqual(c.pdf, { url: "https://d1.islamhouse.com/data/ar/ih_books/single/ar_usool.pdf", size: "350 KB" });
    assert.equal(c.pageUrl, "https://islamhouse.com/ar/books/2829312/");
    assert.equal(c.image, "https://d1.islamhouse.com/data/ar/ih_books/single/ar_usool.jpg");
    assert.equal(salah.pdf?.url, "https://d1.islamhouse.com/data/ar/salah.pdf"); // http ← https لنطاق IslamHouse
    assert.equal(salah.image, null); // بلا غلاف: غلاف مولّد في الواجهة
    assert.equal(siyam.pdf, null); // رابط غير آمن لا يُعرض
  });

  it("الوصف الطويل يُقصّ عند كلمة، والصفحة بلغة الطلب", () => {
    const long = toBookCard({ id: 5, title: "كتاب", description: "كلمة ".repeat(100) }, "en");
    assert.ok(long && long.description.length <= 221 && long.description.endsWith("…"));
    assert.equal(long?.pageUrl, "https://islamhouse.com/en/books/5/");
  });

  it("أشكال الاستجابة: data[]، أو مصفوفة في الجذر، أو فارغة", () => {
    assert.equal(toBookCards([{ id: 1, title: "أ" }], "ar").length, 1);
    assert.deepEqual(toBookCards({ error: "x" }, "ar"), []);
    assert.deepEqual(toBookCards(null, "ar"), []);
  });

  it("المسارات الموثّقة والمفتاح العام الافتراضي", () => {
    assert.equal(apiBase(undefined), `https://api3.islamhouse.com/v3/${ISLAMHOUSE_PUBLIC_KEY}`);
    assert.equal(apiBase("  "), `https://api3.islamhouse.com/v3/${ISLAMHOUSE_PUBLIC_KEY}`);
    assert.equal(apiBase("abc"), "https://api3.islamhouse.com/v3/abc");
    assert.equal(paths.books("tr", 1, 12), "/main/books/tr/tr/1/12/json");
    assert.equal(paths.tree("ar"), "/main/get-categories-tree/ar/json");
    assert.equal(paths.categoryItems(192525, "en", 1, 50), "/main/get-category-items/192525/showall/en/showall/1/50/json");
    assert.equal(paths.item(77, "ar"), "/main/get-item/77/ar/json");
    assert.equal(paths.books("../x", 1, 1), "/main/books/ar/ar/1/1/json");
  });
});

describe("F1b · ربط التصنيفات بشجرة IslamHouse", () => {
  const tree = flattenTree(TREE);
  const ids = resolveTopicIds(tree);

  it("الشجرة مسطّحة بالعمق", () => {
    assert.ok(tree.some((n) => n.id === 5002 && n.title === "الصلاة" && n.depth === 2));
  });

  it("المعرّفات المؤكَّدة ثابتة، والباقي من الشجرة بالأدق ثم الأقرب إلى الجذر", () => {
    assert.equal(ids.aqeedah, 192525);
    assert.equal(ids.tafsir, 728011);
    assert.equal(ids.hadith, 132381);
    assert.equal(ids.prayer, 5002); // «الصلاة» لا «صلاة الجمعة»
    assert.equal(ids.fasting, 5003);
    assert.equal(ids.family, 5004);
    assert.equal(ids.seerah, 6000);
    assert.equal(ids.newMuslim, 7001);
    assert.equal(ids.akhlaq, 8000);
    assert.equal(ids.dawah, 7000);
  });

  it("بلا شجرة: المؤكَّد وحده، والباقي null (فيُستعمل احتياط الكلمات)", () => {
    const none = resolveTopicIds([]);
    assert.equal(none.aqeedah, 192525);
    assert.equal(none.prayer, null);
  });

  it("عشرة تصنيفات، لكل منها كلمات احتياط وعنوان بكل اللغات", () => {
    assert.equal(LIBRARY_TOPIC_KEYS.length, 10);
    assert.deepEqual(LIBRARY_TOPIC_DEFS.map((d) => d.key), [...LIBRARY_TOPIC_KEYS]);
    for (const d of LIBRARY_TOPIC_DEFS) assert.ok(d.keywords.length >= 1 && (d.id || d.match.length), d.key);
    for (const l of locales) for (const k of LIBRARY_TOPIC_KEYS) assert.ok(String(get(messages[l], `library.topics.${k}`) ?? "").trim(), `${l}: ${k}`);
    assert.ok(isTopicKey("family") && !isTopicKey("constructor") && !isTopicKey(""));
  });
});

describe("F1b · الفلترة المحلية", () => {
  const books = toBookCards(BOOKS, "ar");

  it("بالعنوان والمؤلف والوصف، بلا تشكيل ولا همزات ولا «ال»", () => {
    assert.deepEqual(filterBooks(books, "الصلاة").map((b) => b.id), [77]);
    assert.deepEqual(filterBooks(books, "صلاه").map((b) => b.id), [77]);
    assert.deepEqual(filterBooks(books, "الأُصول").map((b) => b.id), [2829312]);
    assert.deepEqual(filterBooks(books, "بن باز").map((b) => b.id), [77]);
    assert.deepEqual(filterBooks(books, "الصيام").map((b) => b.id), [80]);
  });

  it("كل الكلمات مطلوبة، ومطابقة العنوان أولاً", () => {
    assert.deepEqual(filterBooks(books, "صفة الصلاة النبي").map((b) => b.id), [77]);
    assert.deepEqual(filterBooks(books, "الصلاة الحج"), []);
    const ranked = filterBooks(
      [
        { ...books[0], id: 1, title: "كتاب", description: "عن الصيام" },
        { ...books[0], id: 2, title: "الصيام", description: "" },
      ],
      "الصيام",
    );
    assert.deepEqual(ranked.map((b) => b.id), [2, 1]);
  });

  it("البحث الفارغ لا يعيد شيئاً، والتوحيد", () => {
    assert.deepEqual(filterBooks(books, "  "), []);
    assert.equal(normalizeForSearch("إِيمانٌ وآدابُ الصلاةِ"), "ايمان واداب الصلاه");
    assert.equal(normalizeForSearch("Prayer-Book"), "prayer book");
  });
});

describe("F1b · مهلة الطلب", () => {
  it("8 ثوانٍ افتراضياً، وبعدها IslamhouseError(timeout) والطلب يُلغى", async () => {
    assert.equal(ISLAMHOUSE_TIMEOUT_MS, 8000);
    let aborted = false;
    const hang: typeof fetch = (_url, init) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          aborted = true;
          reject(new Error("aborted"));
        });
      });
    const started = Date.now();
    await assert.rejects(fetchJson("https://api3.islamhouse.com/x", { timeoutMs: 60, fetchImpl: hang }), (e: Error) => e instanceof IslamhouseError && e.kind === "timeout");
    assert.ok(Date.now() - started < 1000);
    assert.equal(aborted, true);
  });

  it("خطأ HTTP، وJSON غير صالح، وخطأ الشبكة بأنواعها", async () => {
    const res = (body: string, status = 200): typeof fetch => async () => new Response(body, { status });
    await assert.rejects(fetchJson("u", { fetchImpl: res("{}", 503) }), (e: IslamhouseError) => e.kind === "http");
    await assert.rejects(fetchJson("u", { fetchImpl: res("<html>") }), (e: IslamhouseError) => e.kind === "format");
    await assert.rejects(fetchJson("u", { fetchImpl: async () => { throw new TypeError("fetch failed"); } }), (e: IslamhouseError) => e.kind === "network");
    assert.deepEqual(await fetchJson("u", { fetchImpl: res('{"data":[]}') }), { data: [] });
  });

  it("ذاكرة الخادم 24 ساعة، والمفتاح من ISLAMHOUSE_API_KEY", () => {
    const server = src("lib/library/islamhouse.ts");
    assert.match(server, /revalidate: DAY/);
    assert.match(server, /const DAY = 60 \* 60 \* 24;/);
    assert.match(server, /process\.env\.ISLAMHOUSE_API_KEY/);
    assert.match(src(".env.example"), /^ISLAMHOUSE_API_KEY=paV29H2gm56kvLPy$/m);
  });
});

describe("F1b · صفحة المكتبة", () => {
  const page = src("app/[locale]/library/page.tsx");

  it("لا زر للمكتبة الشاملة ولا بحث MCP", () => {
    assert.doesNotMatch(page, /shamela|mcpSearch|searchLibrary/);
  });

  it("أحدث 12 كتاباً قبل أي بحث، والتصنيف، والبحث، و«كتب بالعربية أيضاً»", () => {
    assert.match(page, /latestBooks\(lang, 12\)/);
    assert.match(page, /topicBooks\(topic, lang\)/);
    assert.match(page, /searchBooks\(q, lang\)/);
    assert.match(page, /t\("arabicToo"\)/);
    assert.match(page, /className="mf-stagger mt-6 grid/);
  });

  it("البطاقة: غلاف مولّد، و«تحميل PDF»، و«الصفحة في IslamHouse»", () => {
    const card = src("components/library/BookCard.tsx");
    assert.match(card, /generated-cover/);
    assert.match(card, /book\.pdf\.url/);
    assert.match(card, /book\.pageUrl/);
    for (const l of locales) {
      for (const k of ["latest", "downloadPdf", "islamhousePage", "arabicToo", "timeout", "unavailable"]) {
        assert.ok(String(get(messages[l], `library.${k}`) ?? get(messages.en, `library.${k}`) ?? "").trim(), `${l}: ${k}`);
      }
    }
    for (const k of ["latest", "downloadPdf", "islamhousePage", "arabicToo", "ownLanguage", "timeout", "by"]) assert.ok(get(messages.ar, `library.${k}`), k);
  });
});

describe("F1b · /about و/eval", () => {
  it("قسم «مفتوح المصدر» برابط المستودع بكل اللغات", () => {
    assert.equal(REPO_URL, "https://github.com/hamdibozkurt1453/mustafti");
    const ar = PAGE_CONTENT.ar.about.sections.find((s) => s.title === "مفتوح المصدر");
    assert.equal(ar?.link?.href, REPO_URL);
    assert.equal(ar?.paras?.[0], "الكود كله منشور للاطلاع والتقييم.");
    for (const l of locales) assert.ok(PAGE_CONTENT[l].about.sections.some((s) => s.link?.href === REPO_URL), l);
  });

  it("زر المستودع في أعلى /eval بكل اللغات", () => {
    for (const l of locales) assert.equal(PAGE_CONTENT[l].eval.topLink?.href, REPO_URL, l);
    assert.match(src("components/InfoPage.tsx"), /content\.topLink &&/);
  });
});

describe("F1b · سياسة الخصوصية", () => {
  const titlesAr = PRIVACY.ar.sections.map((s) => s.title);

  it("الأقسام الاثنا عشر بالترتيب بالعربية والإنجليزية، وتاريخ آخر تحديث", () => {
    for (const [i, word] of ["من نحن", "ما نجمعه", "ما لا نجمعه", "لماذا", "الأساس القانوني", "مع من", "الاحتفاظ", "حقوقك", "ملفات الارتباط", "الأطفال", "التغييرات", "التواصل"].entries()) {
      assert.ok(titlesAr[i]?.includes(word), `${i + 1}: ${titlesAr[i]}`);
    }
    assert.equal(PRIVACY.en.sections.length, 12);
    assert.equal(PRIVACY_UPDATED, "2026-10-06");
    assert.match(PRIVACY.ar.updated ?? "", /آخر تحديث/);
    assert.match(PRIVACY.en.updated ?? "", /Last updated/);
  });

  it("مختصرة بالأقسام نفسها لكل اللغات، مع البريد ورابط الإعدادات", () => {
    for (const l of locales) {
      const p = PRIVACY[l];
      assert.equal(p.sections.length, 12, l);
      assert.ok(p.updated, l);
      assert.ok(JSON.stringify(p).includes(CONTACT_EMAIL), l);
      assert.ok(p.sections.some((s) => s.link?.href === "/me?tab=settings"), l);
      assert.equal(PAGE_CONTENT[l].privacy, p, l);
    }
  });

  it("المحتوى: المحادثة في المتصفح، والتنزيل والحذف من «حسابي»، ونماذج اللغة بلا أسماء مزوّدين", () => {
    const ar = JSON.stringify(PRIVACY.ar);
    assert.match(ar, /المحادثات: تُحفظ في متصفحك/);
    assert.match(ar, /تنزيل بياناتي[\s\S]*حذف حسابي وبياناتي/);
    assert.match(ar, /مزوّد نماذج اللغة/);
    assert.match(ar, /دون 13 عاماً/);
    assert.doesNotMatch(JSON.stringify(PRIVACY), /vercel|supabase|openrouter|google|gemma|openai|anthropic|claude|gpt|llama|mistral/i);
  });
});
