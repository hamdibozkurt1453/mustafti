/**
 * اختبارات R4 — «الحوار» (بلا شبكة):
 *   حارس المنتدى (مقبول، ومرفوض، ومع تنبيه «ليس فتوى»)، والصلاحيات (القواعد النقية، وRLS على Postgres حقيقي
 *   في الذاكرة عبر PGlite)، وحد السبام (القاعدة النقية ومشغّل القاعدة)، وترتيب ردود المختصين، وأفعال الإشراف.
 *   npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

import { tabsFor } from "../lib/admin/rules";
import { checkForumText, hasDefinitiveRuling, suspiciousLinks } from "../lib/forum/guard";
import {
  acceptsReplies,
  askHref,
  availableActions,
  canMarkExpertAnswer,
  canModerate,
  canPost,
  canSeeForumTab,
  FORUM_MOD_ROLES,
  moderationPatch,
  sortPosts,
  sortThreads,
  SPAM_LIMIT,
  spamAllowed,
} from "../lib/forum/rules";

// ---------------------------------------------------------------------------
// حارس المنتدى
// ---------------------------------------------------------------------------

describe("حارس المنتدى: ما يُنشر", () => {
  const accepted = [
    "ما حكم التكفير؟ وما ضوابطه عند أهل السنة والجماعة؟",
    "ما حكم أكل لحم الخنزير لمن اضطر إليه في سفر؟",
    "قل يا أيها الكافرون لا أعبد ما تعبدون",
    "أختلف معك بأدب: الأقوال في المسألة متعددة، وأرجو أن نسأل مختصاً.",
    "انظر فتوى https://islamqa.info/ar/answers/12345 ففيها تفصيل نافع.",
    "رواه البخاري (1234) ومسلم (5678)",
    "Is music haram? I would like to understand the different opinions.",
    "How did you feel after your shahada? Share your experience.",
    "Saya baru masuk Islam, bagaimana cara belajar salat?",
  ];
  for (const text of accepted) {
    it(text.slice(0, 50), () => assert.deepEqual(checkForumText(text), { ok: true, rulingNotice: false }));
  }
});

describe("حارس المنتدى: ما يُرفض", () => {
  const rejected: [string, string][] = [
    ["يا حمار اسكت ولا تتكلم", "insult"],
    ["الله يلعنك على هذا الكلام", "insult"],
    ["You are an idiot, stop posting", "insult"],
    ["أنت كافر ولا تفهم شيئاً", "takfir"],
    ["هؤلاء كفار ولا يُصلّى خلفهم", "takfir"],
    ["You are a kafir for saying this", "takfir"],
    ["Kamu kafir!", "takfir"],
    ["اقتلوهم حيث وجدتموهم في بلدنا", "incitement"],
    ["هذا الرجل دمه مباح", "incitement"],
    ["They should be killed, all of them", "incitement"],
    ["تواصل معي على واتساب لعروض خاصة", "ads"],
    ["اتصل الآن 0555 123 456 للحصول على خصم", "ads"],
    ["Buy now with promo code SAVE20", "ads"],
    ["اقرأ هنا https://bit.ly/abc123", "link"],
    ["Visit example.com for more", "link"],
    ["Details at http://192.168.1.5/x", "link"],
  ];
  for (const [text, reason] of rejected) {
    it(`${reason}: ${text.slice(0, 40)}`, () => assert.deepEqual(checkForumText(text), { ok: false, reason }));
  }

  it("الأشد أولاً: تحريض وسبّ معاً ← تحريض", () => {
    assert.deepEqual(checkForumText("يا كلب، اقتلوهم"), { ok: false, reason: "incitement" });
  });

  it("الروابط: المرجعية مقبولة، والمختصرة وغيرها مرفوضة", () => {
    assert.deepEqual(suspiciousLinks("https://dorar.net/hadith/sharh/1 و www.islamhouse.com/ar/books"), []);
    assert.equal(suspiciousLinks("https://t.co/x و tinyurl.com/y").length, 2);
  });
});

describe("حارس المنتدى: حكم جازم من غير مختص ← يُنشر مع تنبيه", () => {
  const withNotice = [
    "هذا حرام قطعاً ولا نقاش فيه.",
    "يجوز لك أن تجمع الصلاة في السفر.",
    "صلاتك باطلة يا أخي، أعدها.",
    "This is haram, brother.",
    "Bu kesinlikle haramdır.",
    "Hukumnya haram.",
    "C'est haram.",
  ];
  for (const text of withNotice) {
    it(text, () => assert.deepEqual(checkForumText(text), { ok: true, rulingNotice: true }));
  }

  it("السؤال ليس حكماً", () => {
    assert.equal(hasDefinitiveRuling("هل هذا حرام؟ أريد أن أفهم."), false);
    assert.equal(hasDefinitiveRuling("Is it haram to listen to music?"), false);
  });

  it("المختص المقبول بلا فحص ولا تنبيه", () => {
    assert.deepEqual(checkForumText("هذا حرام قطعاً.", { expert: true }), { ok: true, rulingNotice: false });
  });
});

// ---------------------------------------------------------------------------
// الصلاحيات (القواعد النقية)
// ---------------------------------------------------------------------------

describe("صلاحيات الحوار", () => {
  it("الكتابة للمسجّلين فقط", () => {
    assert.equal(canPost("visitor"), false);
    for (const r of ["user", "expert", "moderator", "viewer"] as const) assert.equal(canPost(r), true);
  });

  it("الإشراف: super_admin وmoderator فقط؛ viewer يرى ولا يغيّر", () => {
    assert.deepEqual([...FORUM_MOD_ROLES], ["super_admin", "moderator"]);
    for (const r of ["visitor", "user", "expert", "reviewer", "viewer"] as const) assert.equal(canModerate(r), false);
    assert.equal(canModerate("moderator"), true);
    assert.equal(canSeeForumTab("viewer"), true);
    assert.equal(canSeeForumTab("reviewer"), false);
    assert.ok(tabsFor("viewer").includes("forum"));
    assert.ok(!tabsFor("reviewer").includes("forum"));
  });

  it("«جواب مختص»: المختص المقبول على رده هو فقط", () => {
    assert.equal(canMarkExpertAnswer({ userId: "a", expertStatus: "approved" }, "a"), true);
    assert.equal(canMarkExpertAnswer({ userId: "a", expertStatus: "approved" }, "b"), false);
    assert.equal(canMarkExpertAnswer({ userId: "a", expertStatus: "pending" }, "a"), false);
    assert.equal(canMarkExpertAnswer({ userId: null, expertStatus: null }, null), false);
  });

  it("المقفل والمخفي لا يقبلان رداً", () => {
    assert.equal(acceptsReplies("visible"), true);
    assert.equal(acceptsReplies("locked"), false);
    assert.equal(acceptsReplies("hidden"), false);
  });

  it("أثر أفعال الإشراف، والقفل والتثبيت للمواضيع فقط", () => {
    assert.deepEqual(moderationPatch("post", "hide"), { status: "hidden" });
    assert.deepEqual(moderationPatch("thread", "lock"), { status: "locked" });
    assert.deepEqual(moderationPatch("thread", "pin"), { pinned: true });
    assert.equal(moderationPatch("post", "lock"), null);
    assert.equal(moderationPatch("post", "pin"), null);
    assert.deepEqual(availableActions("thread", "visible", false), ["hide", "lock", "pin"]);
    assert.deepEqual(availableActions("thread", "locked", true), ["hide", "unlock", "unpin"]);
    assert.deepEqual(availableActions("post", "hidden"), ["show"]);
  });

  it("«اسأل مُستفتي عن هذا» ينقل العنوان إلى المحادثة (?q=)", () => {
    assert.deepEqual(askHref("  ما حكم صلاة الوتر؟ "), { pathname: "/", query: { q: "ما حكم صلاة الوتر؟" } });
  });
});

// ---------------------------------------------------------------------------
// حد السبام والترتيب
// ---------------------------------------------------------------------------

describe("حد السبام: 5 مشاركات في 10 دقائق", () => {
  const now = new Date("2026-10-06T12:00:00Z");
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

  it("4 في النافذة ← مسموح، و5 ← ممنوع", () => {
    assert.equal(SPAM_LIMIT, 5);
    assert.equal(spamAllowed([1, 2, 3, 4].map(minutesAgo), now), true);
    assert.equal(spamAllowed([1, 2, 3, 4, 9].map(minutesAgo), now), false);
  });

  it("ما قبل 10 دقائق لا يُعدّ", () => {
    assert.equal(spamAllowed([1, 2, 3, 4, 11, 30].map(minutesAgo), now), true);
  });
});

describe("ترتيب الردود والمواضيع", () => {
  const p = (id: string, at: string, mark: boolean, expert: boolean) => ({ id, created_at: at, is_expert_answer: mark, authorIsExpert: expert });

  it("«جواب مختص» أولاً، ثم البقية بالزمن؛ والتمييز من غير مختص مقبول لا يقدّم", () => {
    const sorted = sortPosts([
      p("u1", "2026-10-06T10:00:00Z", false, false),
      p("e-late", "2026-10-06T12:00:00Z", true, true),
      p("x", "2026-10-06T10:30:00Z", true, false),
      p("e-plain", "2026-10-06T09:00:00Z", false, true),
      p("e-early", "2026-10-06T11:00:00Z", true, true),
    ]);
    assert.deepEqual(sorted.map((x) => x.id), ["e-early", "e-late", "e-plain", "u1", "x"]);
  });

  it("المثبّتة أولاً ثم الأحدث نشاطاً", () => {
    const sorted = sortThreads([
      { id: "a", pinned: false, last_activity_at: "2026-10-06T12:00:00Z" },
      { id: "b", pinned: true, last_activity_at: "2026-10-01T12:00:00Z" },
      { id: "c", pinned: false, last_activity_at: "2026-10-06T13:00:00Z" },
    ]);
    assert.deepEqual(sorted.map((x) => x.id), ["b", "c", "a"]);
  });
});

// ---------------------------------------------------------------------------
// الـ migration على Postgres حقيقي: RLS، وحد السبام، وعدد الردود
// ---------------------------------------------------------------------------

const MIGRATION = readFileSync(new URL("../supabase/migrations/20261011_forum.sql", import.meta.url), "utf8");
const db = new PGlite({ extensions: { pg_trgm } });

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const EXPERT = "33333333-3333-4333-8333-333333333333";

/** ينفّذ الاستعلام بدور محدد وهوية محددة (كما يفعل PostgREST)، ثم يعود إلى المشرف. */
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
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    create table public.profiles (id uuid primary key, display_name text);
    create table public.experts (id uuid primary key references public.profiles (id), status text not null);
    create function public.is_approved_expert() returns boolean language sql stable security definer set search_path = '' as $$
      select exists (select 1 from public.experts e where e.id = auth.uid() and e.status = 'approved') $$;
    grant execute on function public.is_approved_expert() to authenticated;
    insert into public.profiles values ('${USER}', 'u'), ('${OTHER}', 'o'), ('${EXPERT}', 'e');
    insert into public.experts values ('${EXPERT}', 'approved');
  `);
  await db.exec(MIGRATION);
  await db.exec(MIGRATION); // آمن لإعادة التشغيل
});

const newThread = (uid: string, title = "موضوع للنقاش") =>
  as<{ id: string }>(
    "authenticated",
    uid,
    "insert into public.forum_threads (author_id, title, body, category, lang) values ($1, $2, 'نص الموضوع للنقاش', 'general', 'ar') returning id",
    [uid, title],
  );

describe("RLS والـ migration", () => {
  it("الزائر يقرأ الظاهر ولا يكتب", async () => {
    const [{ id }] = await newThread(USER);
    const rows = await as<{ id: string }>("anon", null, "select id from public.forum_threads where id = $1", [id]);
    assert.equal(rows.length, 1);
    await fails(
      as("anon", null, "insert into public.forum_threads (title, body, category) values ('عنوان طويل', 'نص طويل بما يكفي', 'general')"),
      /permission denied/,
    );
  });

  it("المسجّل يكتب باسمه فقط، ولا يضبط الحالة ولا التثبيت", async () => {
    await fails(
      as("authenticated", USER, "insert into public.forum_threads (author_id, title, body, category) values ($1, 'عنوان طويل', 'نص طويل بما يكفي', 'general')", [OTHER]),
      /row-level security/,
    );
    await fails(
      as("authenticated", USER, "insert into public.forum_threads (title, body, category, pinned) values ('عنوان طويل', 'نص طويل بما يكفي', 'general', true)"),
      /permission denied/,
    );
    await fails(as("authenticated", USER, "update public.forum_threads set status = 'hidden'"), /permission denied/);
  });

  it("المخفي لا يُقرأ، والمقفل يُقرأ ولا يُرد عليه، والعدد يتبع الردود الظاهرة", async () => {
    const [{ id }] = await newThread(OTHER);
    await as("authenticated", USER, "insert into public.forum_posts (author_id, thread_id, body) values ($1, $2, 'رد أول')", [USER, id]);
    let [t] = (await db.query<{ replies_count: number }>("select replies_count from public.forum_threads where id = $1", [id])).rows;
    assert.equal(t.replies_count, 1);

    // إخفاء الرد (مسار الخادم) ينقص العدد ويخفيه عن الجميع.
    await db.query("update public.forum_posts set status = 'hidden' where thread_id = $1", [id]);
    [t] = (await db.query<{ replies_count: number }>("select replies_count from public.forum_threads where id = $1", [id])).rows;
    assert.equal(t.replies_count, 0);
    assert.equal((await as("anon", null, "select id from public.forum_posts where thread_id = $1", [id])).length, 0);

    await db.query("update public.forum_threads set status = 'locked' where id = $1", [id]);
    assert.equal((await as("anon", null, "select id from public.forum_threads where id = $1", [id])).length, 1);
    await fails(
      as("authenticated", OTHER, "insert into public.forum_posts (author_id, thread_id, body) values ($1, $2, 'رد ثانٍ')", [OTHER, id]),
      /row-level security/,
    );

    await db.query("update public.forum_threads set status = 'hidden' where id = $1", [id]);
    assert.equal((await as("anon", null, "select id from public.forum_threads where id = $1", [id])).length, 0);
  });

  it("«جواب مختص» للمختص المقبول وحده، وعلى رده", async () => {
    const [{ id }] = await newThread(OTHER, "سؤال لأهل الاختصاص");
    await fails(
      as("authenticated", USER, "insert into public.forum_posts (author_id, thread_id, body, is_expert_answer) values ($1, $2, 'رأيي', true)", [USER, id]),
      /row-level security/,
    );
    const [post] = await as<{ id: string }>(
      "authenticated",
      EXPERT,
      "insert into public.forum_posts (author_id, thread_id, body, is_expert_answer) values ($1, $2, 'جواب المختص', true) returning id",
      [EXPERT, id],
    );
    // المسجّل لا يغيّر تمييز رد غيره (لا صف يطابق سياسته).
    const changed = await as("authenticated", USER, "update public.forum_posts set is_expert_answer = false where id = $1 returning id", [post.id]);
    assert.equal(changed.length, 0);
    const unmarked = await as("authenticated", EXPERT, "update public.forum_posts set is_expert_answer = false where id = $1 returning id", [post.id]);
    assert.equal(unmarked.length, 1);
  });

  it("البلاغ يُكتب باسم صاحبه ولا يُقرأ، ومرة واحدة مفتوحة لكل مُبلِّغ", async () => {
    const [{ id }] = await newThread(OTHER, "موضوع مبلّغ عنه");
    const insert = () =>
      as("authenticated", USER, "insert into public.forum_reports (reporter_id, target_type, target_id, reason) values ($1, 'thread', $2, 'abuse')", [USER, id]);
    await insert();
    await fails(insert(), /duplicate key/);
    await fails(as("authenticated", USER, "select * from public.forum_reports"), /permission denied/);
  });

  it("حد السبام في القاعدة: السادسة خلال 10 دقائق تُرفض", async () => {
    const SPAMMER = "44444444-4444-4444-8444-444444444444";
    await db.query("insert into public.profiles values ($1, 's')", [SPAMMER]);
    for (let i = 0; i < 5; i++) await newThread(SPAMMER, `موضوع رقم ${i + 1}`);
    await fails(newThread(SPAMMER, "موضوع رقم 6"), /forum_rate_limited/);
  });
});
