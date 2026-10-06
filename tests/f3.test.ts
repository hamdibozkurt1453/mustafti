/**
 * F3: النشرة البريدية (صيغة البريد، وحد السبام، والفخ، وتصدير CSV)، وأبواب «الحوار» في جدول
 * (البذرة، وتحويل الموجود على Postgres حقيقي عبر PGlite، والباب المعطّل، وحذف الرد)، وصلاحيات
 * الباب الجديد وتعيين المشرف وحذف التعليق، وبيانات صفحتي /new-muslim و/discover وترجماتهما.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { locales } from "../i18n/locales";
import { tabsFor } from "../lib/admin/rules";
import { ADMIN_ROLES } from "../lib/auth/role-rules";
import { bigQuestionScore, findIntroCategory, pickDiscoverBooks } from "../lib/explore/discover-books-core";
import { cleanVideos, DISCOVER_DEBATES, DISCOVER_LECTURES, embedUrl, NEW_MUSLIM_STORIES } from "../lib/explore/videos";
import { DEFAULT_FORUM_CATEGORIES } from "../lib/forum/categories-data";
import {
  activeCategories,
  canAssignModerator,
  canDeletePost,
  canManageCategories,
  categoryName,
  migrateCategory,
  moderatorAssignment,
  moveCategory,
  normalizeEmail,
  validateNewCategory,
} from "../lib/forum/category-rules";
import { FORUM_CATEGORIES, isForumCategory } from "../lib/forum/rules";
import type { BookCard } from "../lib/library/islamhouse-core";
import { handleSubscribe, NEWSLETTER_LIMIT_PER_HOUR, normalizeNewsletterEmail, subscribersCsv } from "../lib/newsletter/rules";

type Json = Record<string, unknown>;
const messages = Object.fromEntries(
  locales.map((l) => [l, JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), "utf8")) as Json]),
) as Record<string, Json>;
const get = (obj: Json, path: string): unknown => path.split(".").reduce<unknown>((o, k) => (o as Json | undefined)?.[k], obj);

// ---------------------------------------------------------------------------
// 1) النشرة البريدية
// ---------------------------------------------------------------------------

describe("F3 — النشرة: صيغة البريد", () => {
  it("يقبل البريد الصحيح ويوحّده بأحرف صغيرة", () => {
    assert.equal(normalizeNewsletterEmail("  Hamdi@Example.COM "), "hamdi@example.com");
    for (const ok of ["a.b+tag@mail.co", "x_y@sub.domain.org", "user@xn--mgbh0fb.xn--kgbechtv"]) {
      assert.ok(normalizeNewsletterEmail(ok), ok);
    }
  });
  it("يرفض الصيغ الخاطئة", () => {
    for (const bad of ["", "abc", "a@b", "a@b.c", "@x.com", "a@@x.com", "a b@x.com", "a..b@x.com", ".a@x.com", "a@-x.com", "a@x..com", `${"a".repeat(65)}@x.com`, `a@${"b".repeat(250)}.com`, 42, null, "<script>@x.com"]) {
      assert.equal(normalizeNewsletterEmail(bad), null, String(bad));
    }
  });
});

describe("F3 — النشرة: حد السبام والفخ والإدراج", () => {
  const deps = (limitOk = true, insert: "ok" | "duplicate" | "error" = "ok") => {
    const calls = { limit: 0, insert: [] as { email: string; lang: string }[] };
    return {
      calls,
      d: {
        limit: async () => {
          calls.limit++;
          return limitOk;
        },
        insert: async (row: { email: string; lang: string }) => {
          calls.insert.push(row);
          return insert;
        },
      },
    };
  };

  it("بريد صحيح: يمر بالحد ثم يُدرج بلغته", async () => {
    const { calls, d } = deps();
    assert.equal(await handleSubscribe({ email: "A@x.com", lang: "fr" }, d), "ok");
    assert.equal(calls.limit, 1);
    assert.deepEqual(calls.insert, [{ email: "a@x.com", lang: "fr" }]);
  });
  it("لغة غير معروفة تصير العربية", async () => {
    const { calls, d } = deps();
    await handleSubscribe({ email: "a@x.com", lang: "xx" }, d);
    assert.equal(calls.insert[0].lang, "ar");
  });
  it("بريد خاطئ: invalid بلا عدّ ولا إدراج", async () => {
    const { calls, d } = deps();
    assert.equal(await handleSubscribe({ email: "nope" }, d), "invalid");
    assert.equal(await handleSubscribe(null, d), "invalid");
    assert.equal(calls.limit, 0);
    assert.equal(calls.insert.length, 0);
  });
  it("تجاوز الحد: limited بلا إدراج", async () => {
    const { calls, d } = deps(false);
    assert.equal(await handleSubscribe({ email: "a@x.com" }, d), "limited");
    assert.equal(calls.insert.length, 0);
    assert.equal(NEWSLETTER_LIMIT_PER_HOUR, 5);
  });
  it("حقل الفخ المملوء (بوت): نجاح صامت بلا عدّ ولا إدراج", async () => {
    const { calls, d } = deps();
    assert.equal(await handleSubscribe({ email: "a@x.com", website: "http://spam" }, d), "ok");
    assert.equal(calls.limit + calls.insert.length, 0);
  });
  it("المكرر: already، وخطأ القاعدة: error", async () => {
    assert.equal(await handleSubscribe({ email: "a@x.com" }, deps(true, "duplicate").d), "already");
    assert.equal(await handleSubscribe({ email: "a@x.com" }, deps(true, "error").d), "error");
  });
  it("CSV: رأس، وتهريب الاقتباس، ومنع حقن الصيغ", () => {
    const csv = subscribersCsv([
      { email: "a@x.com", lang: "ar", confirmed: false, created_at: "2026-10-06T10:00:00Z" },
      { email: '=cmd"@x.com', lang: "en", confirmed: true, created_at: "2026-10-06T11:00:00Z" },
    ]);
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    assert.equal(lines[0], "email,lang,confirmed,created_at");
    assert.equal(lines[1], '"a@x.com","ar",false,"2026-10-06T10:00:00Z"');
    assert.ok(lines[2].startsWith(`"'=cmd""@x.com"`));
  });
});

// ---------------------------------------------------------------------------
// 2) الأبواب: القواعد والصلاحيات
// ---------------------------------------------------------------------------

describe("F3 — أبواب الحوار: البذرة والقواعد", () => {
  it("13 باباً: الستة السابقة وسبعة جديدة، بأسماء اللغات الاثنتي عشرة", () => {
    const slugs = DEFAULT_FORUM_CATEGORIES.map((c) => c.slug);
    for (const s of ["aqeedah", "ibadat", "muamalat", "family", "new_muslim", "general", "seerah", "tafsir", "hadith", "akhlaq", "dawah", "history", "arabic"]) {
      assert.ok(slugs.includes(s), s);
    }
    assert.equal(slugs.length, 13);
    assert.deepEqual([...FORUM_CATEGORIES], slugs);
    for (const c of DEFAULT_FORUM_CATEGORIES) for (const l of locales) assert.ok(c.name[l]?.trim(), `${c.slug}.${l}`);
  });
  it("«عام» آخر الترتيب، والمعطّل لا يظهر في المفعّلة", () => {
    const rows = DEFAULT_FORUM_CATEGORIES.map((c) => (c.slug === "history" ? { ...c, active: false } : c));
    const act = activeCategories(rows).map((c) => c.slug);
    assert.equal(act.at(-1), "general");
    assert.ok(!act.includes("history"));
  });
  it("اسم الباب بلغة الواجهة، ثم الإنجليزية، ثم الرمز", () => {
    const c = { slug: "x_cat", name: { ar: "باب", en: "Topic" } };
    assert.equal(categoryName(c, "ar"), "باب");
    assert.equal(categoryName(c, "sw"), "Topic");
    assert.equal(categoryName(undefined, "ar", "gone"), "gone");
  });
  it("صيغة الباب، وتحويل القديم إلى general", () => {
    assert.ok(isForumCategory("islamic_history2"));
    for (const bad of ["", "A", "9x", "has space", "x".repeat(40), "عقيدة", 5]) assert.ok(!isForumCategory(bad), String(bad));
    assert.equal(migrateCategory("family", FORUM_CATEGORIES), "family");
    assert.equal(migrateCategory("old_stuff", FORUM_CATEGORIES), "general");
  });
  it("باب جديد: صيغة، وتكرار، والاسم العربي والإنجليزي إلزاميان، والترتيب قبل «عام»", () => {
    const existing = DEFAULT_FORUM_CATEGORIES;
    assert.deepEqual(validateNewCategory({ slug: "Bad Slug", name: { ar: "باب", en: "Topic" } }, existing), { ok: false, error: "slug" });
    assert.deepEqual(validateNewCategory({ slug: "seerah", name: { ar: "سيرة", en: "Seerah" } }, existing), { ok: false, error: "duplicate" });
    assert.deepEqual(validateNewCategory({ slug: "fiqh_women", name: { ar: "فقه المرأة" } }, existing), { ok: false, error: "name" });
    assert.deepEqual(validateNewCategory({ slug: "fiqh_women", name: { ar: "ف", en: "Women" } }, existing), { ok: false, error: "name" });
    const ok = validateNewCategory({ slug: " Fiqh_Women ", name: { ar: " فقه  المرأة ", en: "Women's fiqh", fr: "" } }, existing);
    assert.ok(ok.ok);
    if (ok.ok) {
      assert.equal(ok.row.slug, "fiqh_women");
      assert.deepEqual(ok.row.name, { ar: "فقه المرأة", en: "Women's fiqh" });
      assert.equal(ok.row.order, 130); // بعد «لغة عربية» (120) وقبل «عام» (1000)
      assert.equal(ok.row.active, true);
    }
  });
  it("الترتيب: تبادل مع الجار، ولا شيء في الطرف", () => {
    const rows = [{ slug: "a1", order: 10 }, { slug: "b1", order: 20 }, { slug: "c1", order: 30 }];
    assert.deepEqual(moveCategory(rows, "b1", "up"), [{ slug: "b1", order: 10 }, { slug: "a1", order: 20 }]);
    assert.deepEqual(moveCategory(rows, "b1", "down"), [{ slug: "b1", order: 30 }, { slug: "c1", order: 20 }]);
    assert.deepEqual(moveCategory(rows, "a1", "up"), []);
    assert.deepEqual(moveCategory(rows, "c1", "down"), []);
    const tie = moveCategory([{ slug: "a1", order: 10 }, { slug: "b1", order: 10 }], "b1", "up");
    assert.ok(tie[0].order < tie[1].order);
  });
});

describe("F3 — الصلاحيات: الباب الجديد، والتعيين، وحذف التعليق", () => {
  it("إدارة الأبواب وتعيين المشرفين: super_admin وحده", () => {
    for (const role of [...ADMIN_ROLES, "user", "expert", "visitor"] as const) {
      assert.equal(canManageCategories(role), role === "super_admin", role);
      assert.equal(canAssignModerator(role), role === "super_admin", role);
    }
  });
  it("حذف التعليق: moderator فأعلى؛ viewer وreviewer لا", () => {
    assert.ok(canDeletePost("super_admin"));
    assert.ok(canDeletePost("moderator"));
    for (const role of ["viewer", "reviewer", "user", "expert", "visitor"] as const) assert.ok(!canDeletePost(role), role);
  });
  it("التعيين لا يخفّض دوراً إدارياً آخر", () => {
    assert.equal(moderatorAssignment(null), "assign");
    assert.equal(moderatorAssignment("moderator"), "already");
    for (const r of ["super_admin", "reviewer", "viewer"]) assert.equal(moderatorAssignment(r), "other_role");
  });
  it("بريد التعيين يُوحَّد، والخاطئ مرفوض", () => {
    assert.equal(normalizeEmail(" Mod@X.com "), "mod@x.com");
    assert.equal(normalizeEmail("x"), null);
    assert.equal(normalizeEmail(undefined), null);
  });
  it("تبويب «النشرة» للمشرف الأعلى وحده", () => {
    assert.ok(tabsFor("super_admin").includes("newsletter"));
    for (const r of ["reviewer", "moderator", "viewer"] as const) assert.ok(!tabsFor(r).includes("newsletter"), r);
  });
  it("أفعال الخادم تفحص الدور الصحيح قبل أي كتابة", () => {
    const src = readFileSync(new URL("../lib/forum/category-actions.ts", import.meta.url), "utf8");
    const fn = (name: string) => src.slice(src.indexOf(`export async function ${name}`)).split("export async function")[1];
    for (const name of ["addForumCategory", "setForumCategoryActive", "moveForumCategory"]) assert.match(fn(name), /requireRole\(CATEGORY_ADMIN_ROLES\)/, name);
    for (const name of ["assignModerator", "removeModerator"]) assert.match(fn(name), /requireRole\(ASSIGN_MOD_ROLES\)/, name);
    assert.match(fn("deleteForumPost"), /requireRole\(FORUM_MOD_ROLES\)[\s\S]*audit\([^)]*"forum\.post\.delete"/);
    const csv = readFileSync(new URL("../app/api/admin/newsletter/route.ts", import.meta.url), "utf8");
    assert.match(csv, /requireRole\(\["super_admin"\]\)/);
  });
});

// ---------------------------------------------------------------------------
// 3) الـ migrations على Postgres حقيقي
// ---------------------------------------------------------------------------

const FORUM = readFileSync(new URL("../supabase/migrations/20261011_forum.sql", import.meta.url), "utf8");
const CATEGORIES = readFileSync(new URL("../supabase/migrations/20261013_forum_categories.sql", import.meta.url), "utf8");
const NEWSLETTER = readFileSync(new URL("../supabase/migrations/20261014_newsletter.sql", import.meta.url), "utf8");
const db = new PGlite({ extensions: { pg_trgm } });
const USER = "11111111-1111-4111-8111-111111111111";

async function as<T>(role: "anon" | "authenticated", uid: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`set role ${role}; select set_config('test.uid', '${uid ?? ""}', false);`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("reset role;");
  }
}
const fails = (p: Promise<unknown>, re: RegExp) => assert.rejects(p, (e: Error) => re.test(e.message));
let legacyId = "";
let familyId = "";

describe("F3 — migrations على Postgres (PGlite)", () => {
  before(async () => {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
      grant usage on schema public to anon, authenticated;
      create table public.profiles (id uuid primary key, display_name text);
      create function public.is_approved_expert() returns boolean language sql stable as $$ select false $$;
      grant execute on function public.is_approved_expert() to authenticated;
      insert into public.profiles values ('${USER}', 'u');
    `);
    await db.exec(FORUM);
    // مواضيع قبل F3: باب معروف، وباب قديم غير معروف (بعد رفع القيد مؤقتاً لمحاكاته).
    familyId = (await db.query<{ id: string }>("insert into public.forum_threads (author_id, title, body, category) values ($1, 'موضوع أسري', 'نص الموضوع للنقاش', 'family') returning id", [USER])).rows[0].id;
    await db.exec("alter table public.forum_threads drop constraint forum_threads_category_check");
    legacyId = (await db.query<{ id: string }>("insert into public.forum_threads (author_id, title, body, category) values ($1, 'موضوع قديم', 'نص الموضوع للنقاش', 'oldcat') returning id", [USER])).rows[0].id;
    await db.exec("alter table public.forum_threads add constraint forum_threads_category_check check (category <> '')");
    await db.exec("alter table public.forum_threads drop constraint forum_threads_category_check");
    await db.exec(CATEGORIES);
    await db.exec(CATEGORIES); // آمن لإعادة التشغيل
    await db.exec(NEWSLETTER);
    await db.exec(NEWSLETTER);
  });

  it("البذرة تطابق lib/forum/categories-data.ts", async () => {
    const rows = (await db.query<{ slug: string; name: Record<string, string>; order: number; active: boolean }>('select slug, name, "order", active from public.forum_categories order by "order"')).rows;
    assert.deepEqual(
      rows.map((r) => ({ slug: r.slug, name: r.name, order: r.order, active: r.active })),
      [...DEFAULT_FORUM_CATEGORIES].sort((a, b) => a.order - b.order).map((c) => ({ slug: c.slug, name: c.name, order: c.order, active: c.active })),
    );
  });
  it("تحويل الموجود: المعروف يبقى، والقديم يصير general، والقيد مفتاح خارجي", async () => {
    const cat = async (id: string) => (await db.query<{ category: string }>("select category from public.forum_threads where id = $1", [id])).rows[0].category;
    assert.equal(await cat(familyId), "family");
    assert.equal(await cat(legacyId), "general");
    await fails(db.query("insert into public.forum_threads (author_id, title, body, category) values ($1, 'عنوان طويل', 'نص طويل بما يكفي', 'nope')", [USER]), /foreign key/);
  });
  it("الزائر يقرأ الأبواب ولا يكتبها؛ المسجّل لا يعدّلها", async () => {
    assert.equal((await as("anon", null, "select slug from public.forum_categories")).length, 13);
    await fails(as("anon", null, "insert into public.forum_categories (slug, name) values ('xx', '{\"ar\":\"س\"}')"), /permission denied/);
    await fails(as("authenticated", USER, "update public.forum_categories set active = false"), /permission denied/);
  });
  it("موضوع جديد في باب جديد مفعّل يُقبل، وفي باب معطّل يُرفض", async () => {
    const ok = await as<{ id: string }>("authenticated", USER, "insert into public.forum_threads (author_id, title, body, category) values ($1, 'عن السيرة', 'نص الموضوع للنقاش', 'seerah') returning id", [USER]);
    assert.equal(ok.length, 1);
    await db.query("update public.forum_categories set active = false where slug = 'history'");
    await fails(
      as("authenticated", USER, "insert into public.forum_threads (author_id, title, body, category) values ($1, 'عن التاريخ', 'نص الموضوع للنقاش', 'history')", [USER]),
      /row-level security/,
    );
  });
  it("حذف رد ظاهر يُنقص عدد الردود", async () => {
    await as("authenticated", USER, "insert into public.forum_posts (author_id, thread_id, body) values ($1, $2, 'رد أول')", [USER, familyId]);
    const count = async () => (await db.query<{ replies_count: number }>("select replies_count from public.forum_threads where id = $1", [familyId])).rows[0].replies_count;
    assert.equal(await count(), 1);
    await db.query("delete from public.forum_posts where thread_id = $1", [familyId]);
    assert.equal(await count(), 0);
  });
  it("النشرة: بريد فريد بأحرف صغيرة، ولا وصول للعموم", async () => {
    await db.query("insert into public.newsletter_subscribers (email, lang) values ('a@x.com', 'ar')");
    await fails(db.query("insert into public.newsletter_subscribers (email) values ('a@x.com')"), /duplicate key/);
    await fails(db.query("insert into public.newsletter_subscribers (email) values ('A@x.com')"), /check constraint/);
    const [row] = (await db.query<{ confirmed: boolean }>("select confirmed from public.newsletter_subscribers")).rows;
    assert.equal(row.confirmed, false);
    await fails(as("anon", null, "select * from public.newsletter_subscribers"), /permission denied/);
    await fails(as("anon", null, "insert into public.newsletter_subscribers (email) values ('b@x.com')"), /permission denied/);
  });
});

// ---------------------------------------------------------------------------
// 4) /new-muslim و/discover
// ---------------------------------------------------------------------------

describe("F3 — الفيديوهات والكتب والترجمات", () => {
  it("أعداد الأقسام كما طُلبت، والمعرّفات صالحة بلا تكرار، ولغات متعددة", () => {
    assert.ok(NEW_MUSLIM_STORIES.length >= 6 && NEW_MUSLIM_STORIES.length <= 9);
    assert.equal(DISCOVER_LECTURES.length, 6);
    assert.ok(DISCOVER_DEBATES.length >= 4 && DISCOVER_DEBATES.length <= 6);
    assert.ok(new Set(NEW_MUSLIM_STORIES.map((v) => v.lang)).size >= 5);
    assert.ok(new Set(DISCOVER_LECTURES.map((v) => v.lang)).size >= 5);
    const ids = [...NEW_MUSLIM_STORIES, ...DISCOVER_LECTURES, ...DISCOVER_DEBATES].map((v) => v.id);
    assert.equal(new Set(ids).size, ids.length);
  });
  it("cleanVideos يرفض المعرّف الخاطئ والمكرر، والتضمين من youtube-nocookie", () => {
    const out = cleanVideos([{ id: "bad", title: "x", lang: "en" }, { id: "abcdefghijk", title: "ok", lang: "en" }, { id: "abcdefghijk", title: "dup", lang: "en" }, { id: "abcdefghijl", title: "", lang: "en" }]);
    assert.deepEqual(out.map((v) => v.title), ["ok"]);
    assert.match(embedUrl("abcdefghijk"), /^https:\/\/www\.youtube-nocookie\.com\/embed\/abcdefghijk\?autoplay=1/);
  });
  it("الكتب: تصنيف «التعريف بالإسلام»، وكتب الأسئلة الكبرى أولاً، وستة بلا تكرار", () => {
    assert.equal(findIntroCategory([{ id: 1, title: "العقيدة", depth: 0 }, { id: 7, title: "التعريف بالإسلام", depth: 1 }]), 7);
    assert.equal(findIntroCategory([{ id: 1, title: "العقيدة", depth: 0 }]), null);
    const book = (id: number, title: string): BookCard => ({ id, title, description: "", author: null, image: null, pageUrl: "https://islamhouse.com/", pdf: null }) as unknown as BookCard;
    assert.ok(bigQuestionScore(book(1, "لماذا أنا مسلم؟")) > bigQuestionScore(book(2, "أحكام الطهارة")));
    const picked = pickDiscoverBooks([book(2, "أحكام الطهارة"), book(1, "لماذا أنا مسلم؟")], [book(1, "لماذا أنا مسلم؟"), book(3, "الإلحاد في الميزان"), book(4, "طبخ")]);
    assert.deepEqual(picked.map((b) => b.id), [1, 2, 3]);
  });
  it("المفاتيح الجديدة موجودة في اللغات الاثنتي عشرة", () => {
    const keys = [
      "explore.storiesTitle", "explore.stepsTitle", "explore.lecturesTitle", "explore.debatesTitle", "explore.externalNote", "explore.booksTitle",
      ...["shahada", "purity", "prayer", "fasting", "quran", "character"].flatMap((k) => [`explore.steps.${k}.title`, `explore.steps.${k}.body`, `explore.steps.${k}.q`]),
      "newsletter.submit", "newsletter.success", "newsletter.invalid", "newsletter.limited",
      "aboutPage.teamTitle", "aboutPage.teamBody", "aboutPage.sourcesTitle",
    ];
    for (const l of locales) for (const k of keys) assert.ok(typeof get(messages[l], k) === "string" && (get(messages[l], k) as string).trim(), `${l}: ${k}`);
    for (const l of ["ar", "en"]) assert.ok(get(messages[l], "admin.forum.settings.categoriesTitle"), l);
  });
  it("لا اسم للنموذج اللغوي ولا للشركة المزوّدة في النصوص الجديدة", () => {
    const text = JSON.stringify(locales.map((l) => [get(messages[l], "explore"), get(messages[l], "aboutPage"), get(messages[l], "newsletter")]));
    assert.doesNotMatch(text, /gemma|google|openai|gpt|claude|anthropic|llama|mistral|openrouter/i);
  });
});
