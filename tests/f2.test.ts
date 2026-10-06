/**
 * اختبارات F2 — سجل المحادثات، وصفحة الدخول، والأذكار الموقوتة، وقسم الأرقام، وترقيم المكتبة (بلا شبكة):
 * RLS للمحادثات على Postgres حقيقي (PGlite كما في R4)، وتجميع المحادثات بالتاريخ، وتحويل الرسائل،
 * واختيار الذكر بحسب الوقت، واختيار طريقة الحساب من البلد، وبذرة الأذكار، وترقيم المكتبة، واللغات.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { locales } from "../i18n/locales";
import { dhikrMoment, type DayTimes } from "../lib/adhkar/moment";
import { OCCASIONS } from "../lib/adhkar/rules";
import {
  cleanTitle,
  firstQuestion,
  fromRows,
  groupConversations,
  groupOf,
  searchConversations,
  titleFrom,
  toRows,
  type UiMessage,
} from "../lib/conversations/rules";
import { collectPage, LIBRARY_PAGE_SIZE, pageSlice, parsePage, type BookCard } from "../lib/library/islamhouse-core";
import { PRIVACY } from "../lib/pages/privacy";
import { MAKKAH, methodForCountry, placeFromHeaders } from "../lib/prayer/geo";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const messages = (l: string) => JSON.parse(src(`messages/${l}.json`)) as Record<string, Record<string, unknown>>;

// ---------------------------------------------------------------------------
// 1) سجل المحادثات: القواعد الصرفة
// ---------------------------------------------------------------------------

describe("F2 · تجميع المحادثات بالتاريخ", () => {
  const now = new Date(2026, 9, 6, 15, 0); // 6 أكتوبر 15:00 بتوقيت الجهاز
  const at = (d: number, h = 12) => new Date(2026, 9, d, h, 0).toISOString();

  it("اليوم، أمس، آخر 7 أيام، أقدم", () => {
    assert.equal(groupOf(new Date(2026, 9, 6, 0, 1), now), "today");
    assert.equal(groupOf(new Date(2026, 9, 5, 23, 59), now), "yesterday");
    assert.equal(groupOf(new Date(2026, 9, 5, 0, 0), now), "yesterday");
    assert.equal(groupOf(new Date(2026, 9, 4, 23, 0), now), "week");
    assert.equal(groupOf(new Date(2026, 8, 30, 0, 0), now), "week");
    assert.equal(groupOf(new Date(2026, 8, 28, 0, 0), now), "older");
  });

  it("بترتيب المجموعات، والأحدث أولاً داخلها، والفارغة لا تظهر", () => {
    const items = [
      { id: "a", updatedAt: at(6, 9) },
      { id: "b", updatedAt: at(6, 14) },
      { id: "c", updatedAt: at(2) },
      { id: "d", updatedAt: new Date(2026, 7, 1).toISOString() },
    ];
    const groups = groupConversations(items, now);
    assert.deepEqual(
      groups.map((g) => [g.group, g.items.map((c) => c.id)]),
      [
        ["today", ["b", "a"]],
        ["week", ["c"]],
        ["older", ["d"]],
      ],
    );
  });

  it("العنوان من أول سؤال (لا جواب استيضاح)، حتى 80 حرفاً", () => {
    const msgs: UiMessage[] = [
      { id: "1", role: "user", text: "  نعم  ", case: true },
      { id: "2", role: "user", text: "ما حكم   صلاة الجماعة؟\nوما فضلها" },
    ];
    assert.equal(titleFrom(firstQuestion(msgs)), "ما حكم صلاة الجماعة؟ وما فضلها");
    const long = titleFrom("س".repeat(200));
    assert.equal(long.length, 80);
    assert.ok(long.endsWith("…"));
    assert.equal(cleanTitle("   "), null);
    assert.equal(cleanTitle(" عنوان  جديد "), "عنوان جديد");
  });

  it("البحث في العناوين بلا تشكيل ولا فرق في الهمزات", () => {
    const items = [{ title: "أحكام الصلاة" }, { title: "Fasting in Ramadan" }, { title: "الزكاة" }];
    assert.deepEqual(searchConversations(items, "احكام").map((c) => c.title), ["أحكام الصلاة"]);
    assert.deepEqual(searchConversations(items, "FASTING ramadan").map((c) => c.title), ["Fasting in Ramadan"]);
    assert.equal(searchConversations(items, "").length, 3);
  });

  it("الرسائل المكتملة وحدها تُحفظ، وتُستعاد كاملة بمصادرها", () => {
    const U = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const P = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const sources = [{ n: 1, title: "صحيح البخاري", url: "https://dorar.net/x" }];
    const ui: UiMessage[] = [
      { id: U, role: "user", text: "ما فضل الصدقة؟", dir: "rtl" },
      { id: B, role: "bot", status: "done", stage: "writing", text: "الصدقة… [1]", sources, question: "ما فضل الصدقة؟", lang: "ar" },
      { id: P, role: "bot", status: "streaming", text: "جارٍ", sources: [], question: "x" },
      { id: "not-a-uuid", role: "user", text: "؟" },
    ];
    const rows = toRows(ui);
    assert.deepEqual(rows.map((r) => [r.id, r.seq, r.role]), [
      [U, 0, "user"],
      [B, 1, "bot"],
    ]);
    assert.equal(rows[1].reply.stage, undefined); // حقل مؤقت لا يُحفظ
    const back = fromRows([...rows].reverse());
    assert.equal(back[0].id, U);
    assert.equal(back[1].text, "الصدقة… [1]");
    assert.deepEqual(back[1].sources, sources);
    assert.equal(back[1].status, "done");
    assert.equal(back[0].dir, "rtl");
  });
});

// ---------------------------------------------------------------------------
// 2) سجل المحادثات: الـ migration وRLS على Postgres حقيقي
// ---------------------------------------------------------------------------

const MIGRATION = src("supabase/migrations/20261013_conversations.sql");
const db = new PGlite();
const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

async function as<T>(role: "anon" | "authenticated", uid: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`set role ${role}; select set_config('test.uid', '${uid ?? ""}', false);`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("reset role;");
  }
}

async function fails(p: Promise<unknown>, pattern: RegExp) {
  await assert.rejects(p, (e: Error) => pattern.test(e.message));
}

before(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    create table public.profiles (id uuid primary key, display_name text);
    insert into public.profiles values ('${ALICE}', 'a'), ('${BOB}', 'b');
  `);
  await db.exec(MIGRATION);
  await db.exec(MIGRATION); // آمن لإعادة التشغيل
});

const newConversation = (uid: string, title = "سؤال", mode = "general") =>
  as<{ id: string; user_id: string }>(
    "authenticated",
    uid,
    "insert into public.conversations (mode, title) values ($1, $2) returning id, user_id",
    [mode, title],
  );

describe("F2 · RLS للمحادثات (PGlite)", () => {
  it("المحادثة باسم صاحبها تلقائياً، ولا يضبط أحد user_id بنفسه", async () => {
    const [c] = await newConversation(ALICE);
    assert.equal(c.user_id, ALICE);
    await fails(
      as("authenticated", ALICE, "insert into public.conversations (user_id, mode, title) values ($1, 'general', 'x')", [BOB]),
      /permission denied/,
    );
  });

  it("كلٌّ يرى محادثاته ورسائلها فقط", async () => {
    const [c] = await newConversation(ALICE, "محادثة أليس");
    await as("authenticated", ALICE, "insert into public.messages (conversation_id, seq, role, content, reply) values ($1, 0, 'user', 'سؤال', '{}')", [c.id]);
    const mine = await as<{ id: string }>("authenticated", ALICE, "select id from public.conversations where id = $1", [c.id]);
    assert.equal(mine.length, 1);
    assert.equal((await as("authenticated", BOB, "select id from public.conversations where id = $1", [c.id])).length, 0);
    assert.equal((await as("authenticated", BOB, "select id from public.messages where conversation_id = $1", [c.id])).length, 0);
    assert.equal((await as("authenticated", ALICE, "select id from public.messages where conversation_id = $1", [c.id])).length, 1);
  });

  it("لا يكتب أحد في محادثة غيره، ولا يعدّلها ولا يحذفها", async () => {
    const [c] = await newConversation(ALICE, "خاصة");
    await fails(
      as("authenticated", BOB, "insert into public.messages (conversation_id, role, content) values ($1, 'user', 'تطفل')", [c.id]),
      /row-level security/,
    );
    assert.equal((await as("authenticated", BOB, "update public.conversations set title = 'x' where id = $1 returning id", [c.id])).length, 0);
    assert.equal((await as("authenticated", BOB, "delete from public.conversations where id = $1 returning id", [c.id])).length, 0);
    const [{ title }] = (await db.query<{ title: string }>("select title from public.conversations where id = $1", [c.id])).rows;
    assert.equal(title, "خاصة");
  });

  it("الزائر لا يقرأ ولا يكتب", async () => {
    await fails(as("anon", null, "select * from public.conversations"), /permission denied/);
    await fails(as("anon", null, "insert into public.conversations (mode, title) values ('general', 'x')"), /permission denied/);
    await fails(as("anon", null, "select * from public.messages"), /permission denied/);
  });

  it("إعادة التسمية والحذف لصاحبها، والحذف يحذف الرسائل معها", async () => {
    const [c] = await newConversation(BOB, "قديم");
    await as("authenticated", BOB, "insert into public.messages (conversation_id, role, content) values ($1, 'user', 'س')", [c.id]);
    assert.equal((await as("authenticated", BOB, "update public.conversations set title = 'جديد' where id = $1 returning id", [c.id])).length, 1);
    await fails(as("authenticated", BOB, "update public.conversations set user_id = $2 where id = $1", [c.id, ALICE]), /permission denied/);
    await as("authenticated", BOB, "delete from public.conversations where id = $1", [c.id]);
    assert.equal((await db.query("select id from public.messages where conversation_id = $1", [c.id])).rows.length, 0);
  });

  it("الرسالة تحدّث آخر نشاط المحادثة، والوضع من الثلاثة فقط", async () => {
    const [c] = await newConversation(ALICE, "نشاط");
    await db.query("update public.conversations set updated_at = now() - interval '3 days' where id = $1", [c.id]);
    await as("authenticated", ALICE, "insert into public.messages (conversation_id, role, content) values ($1, 'bot', 'ج')", [c.id]);
    const [{ fresh }] = (await db.query<{ fresh: boolean }>("select updated_at > now() - interval '1 minute' as fresh from public.conversations where id = $1", [c.id])).rows;
    assert.equal(fresh, true);
    await fails(newConversation(ALICE, "x", "fatwa"), /check constraint/);
    assert.equal((await newConversation(ALICE, "مرشد", "new_muslim")).length, 1);
  });

  it("حذف الحساب يحذف محادثاته ورسائلها", async () => {
    const CAROL = "33333333-3333-4333-8333-333333333333";
    await db.query("insert into public.profiles values ($1, 'c')", [CAROL]);
    const [c] = await newConversation(CAROL);
    await as("authenticated", CAROL, "insert into public.messages (conversation_id, role, content) values ($1, 'user', 'س')", [c.id]);
    await db.query("delete from public.profiles where id = $1", [CAROL]);
    assert.equal((await db.query("select id from public.conversations where user_id = $1", [CAROL])).rows.length, 0);
    assert.equal((await db.query("select id from public.messages where conversation_id = $1", [c.id])).rows.length, 0);
  });
});

describe("F2 · الشريط الجانبي والحفظ", () => {
  it("في بداية السطر (يمين RTL ويسار LTR)، ويُطوى على الهاتف بزر", () => {
    const s = src("components/chat/ConversationSidebar.tsx");
    assert.match(s, /start-0/);
    assert.match(s, /rtl:translate-x-full/);
    assert.match(s, /lg:translate-x-0!/);
    assert.match(s, /aria-expanded=\{open\}/);
    assert.match(s, /groups\.\$\{g\.group\}/);
  });

  it("في صفحات المحادثة الثلاث، والزائر على التخزين المحلي", () => {
    assert.match(src("components/home/HomeExperience.tsx"), /useConversations\("general", chat\)/);
    assert.match(src("components/chat/GuidedChat.tsx"), /useConversations\(mode, chat\)/);
    assert.match(src("components/home/ChatView.tsx"), /<ConversationSidebar api=\{history\}/);
    assert.match(src("components/chat/useChat.ts"), /localStorage\.setItem\(key/);
    assert.match(src("components/chat/useConversations.ts"), /if \(!signedIn \|\| !loaded \|\| busy\) return;/);
  });

  it("تنزيل بياناتي يشمل المحادثات", () => {
    assert.match(src("app/api/me/export/route.ts"), /from\("conversations"\)/);
  });

  it("سياسة الخصوصية: محادثات المسجّل في الخادم، وتُحذف مع الحساب، وتُنزَّل من /me", () => {
    const ar = JSON.stringify(PRIVACY.ar);
    assert.match(ar, /وللمستخدم المسجّل تُحفظ في الخادم في حسابه/);
    assert.match(ar, /تُحذف مع حذف الحساب، وتُنزَّل/);
    const en = JSON.stringify(PRIVACY.en);
    assert.match(en, /For signed-in users, stored on our server in your account/);
    assert.doesNotMatch(ar, /للزائر والمسجّل، لا في خوادمنا/);
    for (const l of locales) assert.doesNotMatch(JSON.stringify(PRIVACY[l]), /vercel|supabase|openrouter|gemma|google/i, l);
  });
});

// ---------------------------------------------------------------------------
// 3) المواقيت: الموقع والطريقة آلياً، و«ذِكر الآن»
// ---------------------------------------------------------------------------

describe("F2 · طريقة الحساب من البلد", () => {
  it("أم القرى للسعودية، والمصرية لمصر، وديانت لتركيا، وISNA لأمريكا الشمالية، وMWL للباقي", () => {
    assert.equal(methodForCountry("SA"), "UmmAlQura");
    assert.equal(methodForCountry("eg"), "Egyptian");
    assert.equal(methodForCountry("TR"), "Turkey");
    for (const cc of ["US", "CA", "MX"]) assert.equal(methodForCountry(cc), "NorthAmerica");
    for (const cc of ["ID", "GB", "FR", "PK", "", null, undefined]) assert.equal(methodForCountry(cc), "MuslimWorldLeague");
  });

  it("الموقع من ترويسات Vercel، والاحتياط مكة", () => {
    const h = (o: Record<string, string>) => new Headers(o);
    const ist = placeFromHeaders(
      h({ "x-vercel-ip-latitude": "41.01", "x-vercel-ip-longitude": "28.97", "x-vercel-ip-city": "%C4%B0stanbul", "x-vercel-ip-country": "TR", "x-vercel-ip-timezone": "Europe/Istanbul" }),
    );
    assert.deepEqual(ist, { lat: 41.01, lng: 28.97, city: "İstanbul", country: "TR", tz: "Europe/Istanbul", method: "Turkey", fallback: false });
    assert.deepEqual(placeFromHeaders(h({})), MAKKAH);
    assert.equal(MAKKAH.method, "UmmAlQura");
    assert.deepEqual(placeFromHeaders(h({ "x-vercel-ip-latitude": "200", "x-vercel-ip-longitude": "1" })), MAKKAH);
    const bad = placeFromHeaders(h({ "x-vercel-ip-latitude": "30", "x-vercel-ip-longitude": "31", "x-vercel-ip-timezone": "Not/AZone" }));
    assert.equal(bad.tz, null);
    assert.equal(bad.method, "MuslimWorldLeague");
  });

  it("لا زر «تغيير المدينة والطريقة» ولا قسم المواقيت في /me", () => {
    const card = src("components/home/PrayerCard.tsx");
    assert.doesNotMatch(card, /t\("change"\)|PrayerSettingsForm/);
    assert.match(card, /fetch\("\/api\/geo"/);
    assert.match(card, /data-testid="dhikr-now"/);
    assert.doesNotMatch(src("app/[locale]/me/page.tsx"), /MePrayerSettings|prayerTitle/);
  });
});

describe("F2 · «ذِكر الآن» بحسب الوقت", () => {
  const d = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 6, h, m));
  const times: DayTimes = { fajr: d(4, 30), dhuhr: d(12, 0), asr: d(15, 20), maghrib: d(17, 50), isha: d(19, 10) };
  const at = (h: number, m = 0) => dhikrMoment(d(h, m), times);

  it("قبل الصلاة بدقيقتين: أذكار قبل الصلاة", () => {
    assert.deepEqual(at(11, 58), { occasion: "before_prayer", prayer: "dhuhr" });
    assert.deepEqual(at(12, 3), { occasion: "before_prayer", prayer: "dhuhr" });
    assert.notEqual(at(11, 57).occasion, "before_prayer");
  });

  it("بعد الصلاة بخمس دقائق: أذكار بعد الصلاة (نصف ساعة)", () => {
    assert.deepEqual(at(12, 5), { occasion: "after_prayer", prayer: "dhuhr" });
    assert.deepEqual(at(17, 55), { occasion: "after_prayer", prayer: "maghrib" });
    assert.deepEqual(at(4, 40), { occasion: "after_prayer", prayer: "fajr" });
  });

  it("الصباح بعد الفجر، والمساء بعد العصر، والنوم بعد العشاء، والاستيقاظ قبل الفجر", () => {
    assert.equal(at(7).occasion, "morning");
    assert.equal(at(16, 30).occasion, "evening");
    assert.equal(at(18, 40).occasion, "evening");
    assert.equal(at(21).occasion, "sleep");
    assert.equal(at(1).occasion, "sleep");
    assert.equal(at(3, 30).occasion, "waking");
    assert.equal(at(4, 27).occasion, "waking");
    assert.equal(at(4, 28).occasion, "before_prayer");
  });

  it("بين الظهر والعصر خارج النافذتين: أذكار بعد الصلاة", () => {
    assert.equal(at(13, 30).occasion, "after_prayer");
  });

  it("الفئات الست مترجمة بكل اللغات", () => {
    assert.deepEqual([...OCCASIONS], ["morning", "evening", "before_prayer", "after_prayer", "sleep", "waking"]);
    for (const l of locales) {
      const a = messages(l).adhkar as { moments: Record<string, string>; now: string; all: string };
      for (const o of OCCASIONS) assert.ok(a.moments[o], `${l}: ${o}`);
      assert.ok(a.now && a.all, l);
    }
  });
});

describe("F2 · بذرة الأذكار (migration على PGlite)", () => {
  const BASE = src("supabase/migrations/20261005_adhkar.sql");
  const SEED = src("supabase/migrations/20261014_adhkar_timed.sql");
  const adb = new PGlite();

  it("تُنفَّذ بعد جدول الأذكار مرتين بلا خطأ، وكل ذكر بتخريجه ورابط https وفئاته الصحيحة", async () => {
    await adb.exec("create role anon; create role authenticated;");
    await adb.exec(BASE);
    await adb.exec(SEED);
    await adb.exec(SEED);
    const rows = (
      await adb.query<{ hadith_id: string; occasions: string[]; reference: string; source_url: string; transliteration: string; meaning_en: string; grade: string }>(
        "select hadith_id, occasions, reference, source_url, transliteration, meaning_en, grade from public.adhkar order by position",
      )
    ).rows;
    assert.ok(rows.length >= 25, String(rows.length));
    for (const r of rows) {
      assert.ok(r.hadith_id.startsWith("seed-"), r.hadith_id);
      assert.match(r.reference, /\(\d|\d+:|\d+–\d+/, r.hadith_id); // الكتاب ورقم الحديث أو الآية
      assert.match(r.source_url, /^https:\/\/(dorar\.net|quranenc\.com)\//, r.hadith_id);
      assert.ok(r.transliteration && r.meaning_en && r.grade, r.hadith_id);
    }
    for (const o of OCCASIONS) assert.ok(rows.some((r) => r.occasions.includes(o)), o);
    const ids = rows.map((r) => r.hadith_id);
    for (const id of ["seed-istighfar-3", "seed-ayat-al-kursi", "seed-subhanallah-33", "seed-sayyid-al-istighfar", "seed-bismika-amutu", "seed-alhamdulillah-ahyana"])
      assert.ok(ids.includes(id), id);
    await assert.rejects(adb.query("insert into public.adhkar (hadith_id, lang, occasions, text, grade, source_url) values ('x', 'ar', array['night'], 't', 'g', 'https://x')"));
  });

  it("بناء أذكار الموسوعة لا يحذف البذرة، و/adhkar صفحة كاملة", () => {
    assert.match(src("lib/adhkar/store.ts"), /\.not\("hadith_id", "like", `\$\{SEED_PREFIX\}%`\)/);
    assert.match(src("app/[locale]/adhkar/page.tsx"), /OCCASIONS\.map/);
    assert.doesNotMatch(src("next.config.ts"), /\/adhkar`/);
  });
});

// ---------------------------------------------------------------------------
// 4) صفحة الدخول، وقسم الأرقام
// ---------------------------------------------------------------------------

describe("F2 · صفحة الدخول والتسجيل", () => {
  it("بطاقة من جزأين: الهوية بالنقش المتحرك أولاً (يمين RTL)، والنموذج", () => {
    const shell = src("components/auth/AuthShell.tsx");
    assert.match(shell, /md:grid-cols-/);
    assert.match(shell, /<GeometricPattern className="mf-drift/);
    assert.match(shell, /t\("brandGreeting"\)/);
    assert.ok(shell.indexOf('data-testid="auth-brand"') < shell.indexOf("{children}"));
    const form = src("components/auth/AuthForm.tsx");
    assert.match(form, /<PasswordInput/);
    assert.match(form, /t\("forgot"\)/);
    assert.match(form, /t\("methodMagic"\)/);
    assert.match(form, /t\("noAccount"\)/);
  });

  it("«السلام عليكم» وسطر المنصة بكل اللغات", () => {
    for (const l of locales) {
      const a = messages(l).auth as Record<string, string>;
      assert.ok(a.brandGreeting && a.brandLine, l);
    }
    assert.equal((messages("ar").auth as Record<string, string>).brandGreeting, "السلام عليكم");
  });

  it("الحركة تحترم prefers-reduced-motion", () => {
    const css = src("app/globals.css");
    assert.match(css, /@keyframes mf-drift/);
    assert.match(css, /\.mf-breathe, \.mf-dot, \.mf-caret, \.mf-drift \{ animation: none; \}/);
  });
});

describe("F2 · قسم «المعرفة من مصادرها»", () => {
  it("النقش نفسه بانجراف خفيف، والعدّ التصاعدي، والبطاقات بحدود رقيقة وظهور متدرج", () => {
    const s = src("components/home/Stats.tsx");
    assert.match(s, /<GeometricPattern className="mf-drift/);
    assert.match(s, /<CountUp to=\{it\.n\}/);
    assert.match(s, /border border-ivory-50\/15/);
    assert.match(s, /delay=\{reduced \? 0 : 0\.08 \* \(i \+ 1\)\}/);
    assert.match(s, /useState\(reduced \? to : 0\)/);
  });
});

// ---------------------------------------------------------------------------
// 5) المكتبة: 6 كتب، و«اكتشف المزيد»
// ---------------------------------------------------------------------------

const book = (id: number): BookCard => ({
  id,
  title: `كتاب ${id}`,
  author: null,
  description: "",
  image: null,
  pdf: null,
  pageUrl: `https://islamhouse.com/ar/books/${id}/`,
  lang: "ar",
});

describe("F2 · ترقيم المكتبة", () => {
  it("6 في الصفحة، و«المزيد» ما دام بعدها شيء", () => {
    assert.equal(LIBRARY_PAGE_SIZE, 6);
    const list = Array.from({ length: 14 }, (_, i) => book(i + 1));
    assert.deepEqual(pageSlice(list, 1).books.map((b) => b.id), [1, 2, 3, 4, 5, 6]);
    assert.equal(pageSlice(list, 1).hasMore, true);
    assert.deepEqual(pageSlice(list, 3).books.map((b) => b.id), [13, 14]);
    assert.equal(pageSlice(list, 3).hasMore, false);
    assert.equal(pageSlice(list.slice(0, 12), 2).hasMore, false);
  });

  it("رقم الصفحة بين 1 و50، وإلا 1", () => {
    assert.equal(parsePage("3"), 3);
    for (const v of ["0", "-1", "abc", "2.5", "999", null, undefined]) assert.equal(parsePage(v), 1);
  });

  it("من صفحات الواجهة البرمجية: يجمع الكتب (يترك غير الكتب) ويطلب ما يلزم فقط", async () => {
    // مصدر بصفحات من 4 عناصر: نصفها كتب ونصفها مقالات، و3 صفحات.
    const calls: number[] = [];
    const fetchPage = async (p: number) => {
      calls.push(p);
      if (p > 3) return [];
      return Array.from({ length: 4 }, (_, i) => {
        const id = (p - 1) * 4 + i + 1;
        return { id, title: `مادة ${id}`, type: i % 2 ? "articles" : "books" };
      });
    };
    const first = await collectPage(fetchPage, "ar", 1, { perPage: 4 });
    assert.deepEqual(first.books.map((b) => b.id), [1, 3, 5, 7, 9, 11]);
    assert.equal(first.hasMore, false); // 6 كتب فقط في المصدر كله
    assert.deepEqual(calls, [1, 2, 3, 4]);

    calls.length = 0;
    const many = async (p: number) => {
      calls.push(p);
      return Array.from({ length: 50 }, (_, i) => ({ id: (p - 1) * 50 + i + 1, title: `ك ${i}`, type: "books" }));
    };
    const p2 = await collectPage(many, "ar", 2);
    assert.deepEqual(p2.books.map((b) => b.id), [7, 8, 9, 10, 11, 12]);
    assert.equal(p2.hasMore, true);
    assert.deepEqual(calls, [1]); // الصفحة الأولى من المصدر تكفي (والطلبات مخزّنة 24 ساعة)
    const p9 = await collectPage(many, "ar", 9);
    assert.deepEqual(p9.books.map((b) => b.id), [49, 50, 51, 52, 53, 54]);
  });

  it("في القائمة الافتراضية والتصنيفات والبحث: 6 ثم «اكتشف المزيد»", () => {
    const page = src("app/[locale]/library/page.tsx");
    assert.match(page, /latestBooks\(lang\)/);
    assert.match(page, /topicBooks\(topic, lang\)/);
    assert.match(page, /searchBooks\(q, lang\)/);
    assert.match(page, /query=\{\{ lang, \.\.\.\(q \? \{ q \} : topic \? \{ topic \} : \{\}\) \}\}/);
    const api = src("app/api/library/route.ts");
    assert.match(api, /searchBooks\(q, lang, page\)/);
    assert.match(api, /topicBooks\(topic, lang, page\)/);
    assert.match(api, /latestBooks\(lang, page\)/);
    for (const l of locales) assert.ok((messages(l).library as Record<string, string>).more, l);
  });
});

describe("F2 · لا اسم نموذج ولا مزوّد في النصوص الجديدة", () => {
  it("مفاتيح F2 بكل اللغات", () => {
    for (const l of locales) {
      const m = messages(l);
      const text = JSON.stringify([(m.chat as Record<string, unknown>).history, (m.auth as Record<string, unknown>).brandLine, m.adhkar, m.library]);
      assert.doesNotMatch(text, /gemma|google|openrouter|openai|anthropic|claude|gpt|llama|mistral/i, l);
      assert.ok(((m.chat as Record<string, Record<string, unknown>>).history.groups as Record<string, string>).yesterday, l);
    }
  });
});
