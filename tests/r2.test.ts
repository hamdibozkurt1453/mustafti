/**
 * R2: الرأس والقائمة، والمكتبة، وصفحة «حسابي»، والتحويلات، والترجمات الجديدة.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { navItems } from "../components/nav-items";
import { locales } from "../i18n/locales";
import { deleteConfirmed, exportFileName, ME_TABS, parseAccountInput, resolveTab } from "../lib/account/rules";
import { cleanQuery, isIslamhouseUrl, LIBRARY_TOPICS, LIBRARY_TYPES, libraryMeta, toLibraryCards } from "../lib/library/items";
import { settingsFromProfile } from "../lib/prayer/times";
import nextConfig from "../next.config";

type Tree = { [k: string]: string | Tree };
const messages = (l: string) => JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), "utf8")) as Tree;
const get = (t: Tree, path: string) => path.split(".").reduce<string | Tree | undefined>((n, k) => (n && typeof n === "object" ? n[k] : undefined), t);

describe("R2 · الرأس", () => {
  it("القائمة بالترتيب: المحادثة · الحوار · المسلم الجديد · تعرّف على الإسلام · المكتبة · عن مُستفتي", () => {
    assert.deepEqual(
      navItems.map((i) => i.href),
      ["/", "/forum", "/new-muslim", "/discover", "/library", "/about"],
    );
  });

  it("لا رابط للمواقيت ولا للأذكار في القائمة", () => {
    const hrefs: string[] = navItems.map((i) => i.href);
    assert.ok(!hrefs.includes("/prayer") && !hrefs.includes("/adhkar"));
  });

  it("كل روابط القائمة مترجمة في العربية والإنجليزية والأردية", () => {
    for (const l of ["ar", "en", "ur"]) {
      for (const i of navItems) assert.ok(String(get(messages(l), `nav.${i.key}`) ?? "").trim(), `${l}: nav.${i.key}`);
      assert.ok(String(get(messages(l), "nav.signOut") ?? "").trim(), `${l}: nav.signOut`);
    }
  });

  it("الرأس ثلاثة أعمدة متساوية الجانبين (القائمة في المنتصف بالاتجاهين)", () => {
    const src = readFileSync(new URL("../components/SiteHeader.tsx", import.meta.url), "utf8");
    assert.match(src, /grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/);
    assert.match(src, /justify-start/);
    assert.match(src, /justify-end/);
  });
});

describe("R2 · التحويلات", () => {
  it("/prayer إلى الرئيسية، و/expert/profile إلى /me، بكل اللغات (F2: /adhkar صفحة كاملة)", async () => {
    const rules = await nextConfig.redirects!();
    const find = (p: string) => rules.find((r) => r.source.endsWith(p));
    assert.equal(find("/prayer")?.destination, "/:locale#prayer");
    assert.equal(find("/adhkar"), undefined);
    assert.equal(find("/expert/profile")?.destination, "/:locale/me");
    // قواعد R2 بكل اللغات (F4: وقواعد تحويل اللغات المعطّلة إلى /en منفصلة).
    for (const r of rules.filter((x) => x.source.startsWith("/:locale"))) for (const l of locales) assert.ok(r.source.includes(l), `${r.source}: ${l}`);
  });
});

describe("R2 · المكتبة", () => {
  it("التصنيفات المقترحة مترجمة في كل اللغات (F1b: عشرة)", () => {
    assert.deepEqual([...LIBRARY_TOPICS], ["aqeedah", "prayer", "fasting", "seerah", "newMuslim", "family", "tafsir", "hadith", "akhlaq", "dawah"]);
    for (const l of locales) {
      for (const k of LIBRARY_TOPICS) assert.ok(String(get(messages(l), `library.topics.${k}`) ?? "").trim(), `${l}: ${k}`);
      for (const k of LIBRARY_TYPES) assert.ok(String(get(messages(l), `library.types.${k}`) ?? "").trim(), `${l}: type ${k}`);
    }
  });

  it("النوع واللغة من الرابط الرسمي", () => {
    assert.deepEqual(libraryMeta("https://islamhouse.com/ar/books/2829312/"), { type: "books", lang: "ar" });
    assert.deepEqual(libraryMeta("https://islamhouse.com/en/audios/123/"), { type: "audios", lang: "en" });
    assert.deepEqual(libraryMeta("https://islamhouse.com/ur/fatwa/9/", "UR"), { type: "fatwa", lang: "ur" });
    assert.deepEqual(libraryMeta("https://islamhouse.com/read/xyz"), { type: "other", lang: null });
  });

  it("روابط islamhouse.com وحدها، بلا تكرار", () => {
    assert.equal(isIslamhouseUrl("https://islamhouse.com/ar/books/1/"), true);
    assert.equal(isIslamhouseUrl("https://d1.islamhouse.com/data/ar/x.pdf"), true);
    assert.equal(isIslamhouseUrl("http://islamhouse.com/ar/books/1/"), false);
    assert.equal(isIslamhouseUrl("https://islamhouse.com.evil.io/ar/books/1/"), false);
    assert.equal(isIslamhouseUrl("javascript:alert(1)"), false);
    const cards = toLibraryCards([
      { title: "كتاب", text: "نبذة", url: "https://islamhouse.com/ar/books/1/" },
      { title: "كتاب", text: "نبذة", url: "https://islamhouse.com/ar/books/1/" },
      { title: "خارجي", text: "", url: "https://example.com/x" },
    ]);
    assert.equal(cards.length, 1);
    assert.equal(cards[0].type, "books");
  });

  it("نص البحث (F1b: حُذف زر الشاملة من المكتبة)", () => {
    assert.equal(cleanQuery("  الصلاة   والصيام "), "الصلاة والصيام");
    assert.equal(cleanQuery(["a"]), "");
    assert.equal(cleanQuery("x".repeat(500)).length, 120);
  });
});

describe("R2 · حسابي", () => {
  it("التبويبات، و«ملفي العام» للمختص فقط", () => {
    assert.deepEqual([...ME_TABS], ["profile", "conversations", "cases", "forum", "public", "settings"]);
    assert.equal(resolveTab(undefined, false), "profile");
    assert.equal(resolveTab("cases", false), "cases");
    assert.equal(resolveTab("public", false), "profile");
    assert.equal(resolveTab("public", true), "public");
    assert.equal(resolveTab("../admin", true), "profile");
  });

  it("الاسم واللغة", () => {
    assert.deepEqual(parseAccountInput({ displayName: "  حمدي   ", preferredLang: "ur" }), { displayName: "حمدي", preferredLang: "ur" });
    assert.deepEqual(parseAccountInput({ displayName: "", preferredLang: "ar" }), { displayName: null, preferredLang: "ar" });
    assert.equal(parseAccountInput({ displayName: "x", preferredLang: "xx" }), null);
    assert.equal(parseAccountInput({ displayName: "x".repeat(81), preferredLang: "ar" }), null);
    assert.equal(parseAccountInput(null), null);
  });

  it("عبارة تأكيد الحذف موجودة في كل اللغات وتُطابَق بحروفها", () => {
    for (const l of locales) {
      const phrase = String(get(messages(l), "me.settings.confirmPhrase") ?? "");
      assert.ok(phrase.trim(), l);
      assert.equal(deleteConfirmed(`  ${phrase.replace(/ /g, "  ")} `, phrase), true, l);
      assert.equal(deleteConfirmed("", phrase), false, l);
      assert.equal(deleteConfirmed("نعم", phrase), false, l);
    }
  });

  it("اسم ملف «تنزيل بياناتي»", () => {
    assert.equal(exportFileName(new Date("2026-10-05T12:00:00Z")), "mustafti-data-2026-10-05.json");
  });

  it("migration الحذف تُبقي أجوبة المختصين (on delete set null)", () => {
    const sql = readFileSync(new URL("../supabase/migrations/20261008_account_deletion.sql", import.meta.url), "utf8");
    assert.match(sql, /alter column expert_id drop not null/);
    assert.match(sql, /on delete set null/);
    const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
    assert.match(schema, /expert_id\s+uuid references public\.experts \(id\) on delete set null/);
  });
});

describe("R2 · المواقيت من الحساب", () => {
  it("settingsFromProfile", () => {
    assert.deepEqual(settingsFromProfile({ city: "istanbul", calc_method: "Turkey:hanafi" }), {
      place: { kind: "city", cityId: "istanbul" },
      method: "Turkey",
      madhab: "hanafi",
    });
    assert.equal(settingsFromProfile({ city: null, calc_method: null }), null);
    assert.equal(settingsFromProfile(null), null);
  });
});
