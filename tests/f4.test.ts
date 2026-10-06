/**
 * اختبارات F4 (بلا شبكة): الفيديوهات بلغة الواجهة وحدها (وإلا الإنجليزية مع سطر التنبيه)، وفيديو واحد
 * نشط في نافذة واحدة، واللغات المفعّلة اثنتان (القائمة والتوجيه وتحويل البقية إلى /en).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import nextConfig from "../next.config";
import { DISABLED_LOCALES, ENABLED_LOCALES, isEnabledLocale, locales } from "../i18n/locales";
import { routing } from "../i18n/routing";
import { DISCOVER_DEBATES, DISCOVER_LECTURES, getActiveVideo, NEW_MUSLIM_STORIES, openVideo, subscribeVideo, videosFor, type Video } from "../lib/explore/videos";
import { pageContent } from "../lib/pages/content";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("F4 · الفيديوهات بلغة الواجهة", () => {
  it("في /ar العربية وحدها، وفي /en الإنجليزية وحدها، بالأعداد المطلوبة", () => {
    for (const [list, n] of [
      [NEW_MUSLIM_STORIES, 6],
      [DISCOVER_LECTURES, 4],
      [DISCOVER_DEBATES, 3],
    ] as const) {
      const ar = videosFor(list, "ar");
      assert.equal(ar.fallback, false);
      assert.ok(ar.videos.length >= n, `${ar.videos.length} < ${n}`); // F5: حدّ أدنى بعد تنقية المعرّفات
      assert.ok(ar.videos.every((v) => v.lang === "ar"));
      const en = videosFor(list, "en");
      assert.equal(en.fallback, false);
      assert.ok(en.videos.length > 0 && en.videos.every((v) => v.lang === "en"));
    }
  });

  it("لا تركية ولا غيرها في ar/en", () => {
    for (const list of [NEW_MUSLIM_STORIES, DISCOVER_LECTURES, DISCOVER_DEBATES])
      for (const l of ["ar", "en"]) assert.ok(videosFor(list, l).videos.every((v) => v.lang === l), l);
  });

  it("لغة بلا فيديوهات: الإنجليزية مع سطر «فيديوهات بالإنجليزية»", () => {
    const list: Video[] = [
      { id: "aaaaaaaaaaa", title: "en", channel: "", lang: "en" },
      { id: "bbbbbbbbbbb", title: "tr", channel: "", lang: "tr" },
    ];
    const r = videosFor(list, "fr");
    assert.equal(r.fallback, true);
    assert.deepEqual(r.videos.map((v) => v.lang), ["en"]);
    assert.match(src("components/explore/VideoSection.tsx"), /fallback && \([\s\S]*t\("englishVideos"\)/);
    for (const l of ["ar", "en"]) assert.ok((JSON.parse(src(`messages/${l}.json`)) as { explore: Record<string, string> }).explore.englishVideos);
  });
});

describe("F4 · فيديو واحد نشط في نافذة", () => {
  it("فتح فيديو يغلق السابق، والإغلاق يعيده null، والمشتركون يُبلَّغون", () => {
    const [a, b] = NEW_MUSLIM_STORIES;
    let calls = 0;
    const off = subscribeVideo(() => calls++);
    openVideo(a);
    assert.equal(getActiveVideo()?.id, a.id);
    openVideo(b);
    assert.equal(getActiveVideo()?.id, b.id); // واحد فقط في كل وقت
    openVideo(null);
    assert.equal(getActiveVideo(), null);
    off();
    openVideo(a);
    assert.equal(calls, 3);
    openVideo(null);
  });

  it("النافذة: حتى 960px بنسبة 16:9، وخلفية داكنة، وإغلاق بالزر وEsc والضغط خارجها، وتشغيل تلقائي", () => {
    const g = src("components/explore/VideoGrid.tsx");
    assert.match(g, /role="dialog"/);
    assert.match(g, /max-w-\[960px\]/);
    assert.match(g, /aspect-video/);
    assert.match(g, /bg-black\/85/);
    assert.match(g, /e\.key === "Escape" && openVideo\(null\)/);
    assert.match(g, /e\.target === e\.currentTarget && openVideo\(null\)/);
    assert.match(g, /aria-label=\{labels\.close\}/);
    assert.match(g, /onClick=\{\(\) => openVideo\(video\)\}/);
    assert.match(src("lib/explore/videos.ts"), /autoplay=1/);
    // لا iframe داخل البطاقة الصغيرة: iframe واحد في النافذة.
    assert.equal((g.match(/<iframe/g) ?? []).length, 1);
  });
});

describe("F4 · اللغات المفعّلة: العربية والإنجليزية", () => {
  it("قائمة اللغة تعرض اثنتين، والتوجيه بهما", () => {
    assert.deepEqual([...ENABLED_LOCALES], ["ar", "en"]);
    assert.deepEqual([...routing.locales], ["ar", "en"]);
    assert.match(src("components/LanguageSwitcher.tsx"), /ENABLED_LOCALES\.map\(/);
    assert.ok(isEnabledLocale("en") && !isEnabledLocale("tr"));
  });

  it("ملفات اللغات العشر وبنيتها باقية لإعادة التفعيل", () => {
    assert.equal(locales.length, 12);
    assert.equal(DISABLED_LOCALES.length, 10);
    for (const l of DISABLED_LOCALES) assert.ok(JSON.parse(src(`messages/${l}.json`)));
  });

  it("المسارات الأخرى تحوّل إلى /en بالمسار نفسه", async () => {
    const rules = await nextConfig.redirects!();
    const root = rules.find((r) => r.destination === "/en");
    const deep = rules.find((r) => r.destination === "/en/:path*");
    assert.ok(root && deep);
    for (const l of DISABLED_LOCALES) {
      assert.ok(root.source.includes(l) && deep.source.includes(l), l);
    }
    assert.ok(!deep.source.includes("|ar|") && !deep.source.includes("(ar") && !/\ben\b/.test(deep.source.replace("/en", "")));
  });

  it("النصوص: «العربية والإنجليزية، وعشر لغات قيد الإكمال» في /about و/eval والفوتر", () => {
    const ar = JSON.stringify([pageContent("ar", "about"), pageContent("ar", "eval")]);
    assert.match(ar, /الواجهة بالعربية والإنجليزية، وعشر لغات قيد الإكمال/);
    assert.doesNotMatch(ar, /اثنتي عشرة|إثنتي عشرة|12 لغة/);
    const en = JSON.stringify([pageContent("en", "about"), pageContent("en", "eval")]);
    assert.match(en, /Arabic and English, with ten more languages in progress/);
    assert.doesNotMatch(en, /twelve languages/);
    assert.equal((JSON.parse(src("messages/ar.json")) as { footer: Record<string, string> }).footer.languages, "العربية والإنجليزية، وعشر لغات قيد الإكمال.");
    assert.match(src("components/SiteFooter.tsx"), /t\("footer\.languages"\)/);
  });
});
