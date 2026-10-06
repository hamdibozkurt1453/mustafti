/**
 * اختبارات F1 — إصلاحات الفحص اليدوي (بلا شبكة):
 *   تنظيف نص القرآن للعرض، والشعار، وشريط الزائر، وحقول الدخول وإعادة التعيين، وكلمات تصنيفات المكتبة،
 *   وصفحات about/eval/privacy، والتذييل، و«الصورة والنبذة» (ترتيب الأقسام، والمدخلات، والـ migration على PGlite).
 *   npm test
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

import { footerProjectLinks } from "../components/nav-items";
import { locales } from "../i18n/locales";
import { BIO_MAX, parseProfileCardInput, profileSections } from "../lib/account/rules";
import { GUEST_NOTICE_KEY, guestLoginHref, showGuestNotice } from "../lib/chat/guest-notice";
import { PAGE_CONTENT, pageContent, REPO_URL, type InfoPage } from "../lib/pages/content";
import { cleanQuranText, splitQuranSpans } from "../lib/quran-text";
import { consumeHomeRequest, requestHome } from "../lib/ui-store";

type Json = { [key: string]: string | Json };
const messages = Object.fromEntries(
  locales.map((l) => [l, JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), "utf8")) as Json]),
) as Record<string, Json>;
const get = (obj: Json, path: string): unknown => path.split(".").reduce<unknown>((o, k) => (o as Json | undefined)?.[k], obj);
const src = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// ---------------------------------------------------------------------------
// 1) نص القرآن على الهاتف
// ---------------------------------------------------------------------------

describe("1) نص القرآن: خط المصحف وتنظيف الرموز", () => {
  it("يزيل علامات الوقف والزخارف ويبقي الحروف والتشكيل والعلامات العثمانية", () => {
    // ذَٰلِكَ ٱلۡكِتَٰبُ لَا رَيۡبَۛ فِيهِۛ هُدٗى لِّلۡمُتَّقِينَ (البقرة 2) بعلامتي الوقف ۛ وعلامة ۚ
    const raw = "ذَٰلِكَ ٱلۡكِتَٰبُ لَا رَيۡبَۛ فِيهِۛ هُدٗى لِّلۡمُتَّقِينَ ۚ";
    const clean = cleanQuranText(raw);
    assert.equal(clean, "ذَٰلِكَ ٱلۡكِتَٰبُ لَا رَيۡبَ فِيهِ هُدٗى لِّلۡمُتَّقِينَ");
    assert.ok(!/[ۖ-ۜ۞۩]/.test(clean));
    assert.ok(clean.includes("ٱ") && clean.includes("ۡ") && clean.includes("ٰ")); // ٱ ۡ ٰ تبقى
  });

  it("يزيل ما لا يدعمه الخط: رموز خاصة، ومحارف تحكم، وحرف الاستبدال", () => {
    assert.equal(cleanQuranText("بِسۡمِ ٱللَّهِ‎ �۞ ٱلرَّحۡمَٰنِ"), "بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ");
  });

  it("يبقي رقم الآية وقوسيها والتنوين المتتابع", () => {
    assert.equal(cleanQuranText("عَلِيمٌ ﴿٢٩﴾"), "عَلِيمٌ ﴿٢٩﴾");
    assert.equal(cleanQuranText("هُدٗىࣰ"), "هُدٗىࣰ");
  });

  it("الآية بين ﴿ ﴾ في الجواب تُفصل للعرض بخط المصحف، والباقي كما هو", () => {
    const parts = splitQuranSpans("قال تعالى: ﴿إِنَّ ٱللَّهَ غَفُورٌ ۚ رَّحِيمٌ﴾ [1] وهذا شرح.");
    assert.deepEqual(parts, [
      { text: "قال تعالى: ", quran: false },
      { text: "﴿إِنَّ ٱللَّهَ غَفُورٌ رَّحِيمٌ﴾", quran: true },
      { text: " [1] وهذا شرح.", quran: false },
    ]);
    assert.deepEqual(splitQuranSpans("بلا آية"), [{ text: "بلا آية", quran: false }]);
  });

  it("الخط مُضمَّن ومطبَّق على class quran-text في الجواب والبطاقة", () => {
    assert.match(src("app/[locale]/layout.tsx"), /Amiri_Quran\(/);
    assert.match(src("app/globals.css"), /\.quran-text\s*\{[^}]*--font-quran/);
    assert.match(src("components/chat/RichText.tsx"), /className="quran-text"/);
    assert.match(src("components/chat/SourceCard.tsx"), /quran-text[^"]*"[\s\S]*cleanQuranText\(source\.verse\)/);
  });
});

// ---------------------------------------------------------------------------
// 2) الشعار
// ---------------------------------------------------------------------------

describe("2) الشعار رابط حقيقي إلى الرئيسية من أي حالة", () => {
  it("طلب الرئيسية يُستهلك مرة واحدة", () => {
    consumeHomeRequest();
    assert.equal(consumeHomeRequest(), false);
    requestHome();
    assert.equal(consumeHomeRequest(), true);
    assert.equal(consumeHomeRequest(), false);
  });

  it("الشعار في الرأس HomeLink بـ href=\"/\"، والرئيسية تمسح المحادثة عند الطلب", () => {
    assert.match(src("components/SiteHeader.tsx"), /<HomeLink label=/);
    assert.match(src("components/HomeLink.tsx"), /<Link href="\/"[^>]*onClick=\{\(\) => requestHome\(\)\}/);
    assert.match(src("components/home/HomeExperience.tsx"), /consumeHomeRequest\(\)\)\s*return;[\s\S]*newChat\(\);/);
  });
});

// ---------------------------------------------------------------------------
// 3) شريط الزائر
// ---------------------------------------------------------------------------

describe("3) شريط الزائر فوق المحادثة", () => {
  it("يظهر للزائر فقط بعد التأكد، ويختفي بالإغلاق", () => {
    assert.equal(showGuestNotice(false, false), true);
    assert.equal(showGuestNotice(true, false), false);
    assert.equal(showGuestNotice(null, false), false); // لم تُقرأ الجلسة بعد: لا وميض
    assert.equal(showGuestNotice(false, true), false);
    assert.ok(GUEST_NOTICE_KEY.startsWith("mustafti."));
  });

  it("زر الدخول يعود إلى الصفحة نفسها", () => {
    assert.deepEqual(guestLoginHref("/ar/new-muslim"), { pathname: "/login", query: { next: "/ar/new-muslim" } });
  });

  it("النص والزر والإغلاق بكل اللغات الاثنتي عشرة", () => {
    for (const l of locales) {
      for (const key of ["text", "login", "close"]) {
        const value = get(messages[l], `chat.guest.${key}`);
        assert.ok(typeof value === "string" && value.trim(), `${l}: chat.guest.${key}`);
      }
    }
    assert.equal(get(messages.ar, "chat.guest.text"), "محادثتك لا تُحفظ لأنك غير مسجّل. سجّل الدخول لتبقى محادثاتك.");
  });

  it("الشريط في واجهة المحادثة المشتركة (الرئيسية والمرشد والداعية)", () => {
    assert.match(src("components/home/ChatView.tsx"), /<GuestNotice \/>/);
  });
});

// ---------------------------------------------------------------------------
// 4) الدخول: العين و«نسيت كلمة المرور؟»
// ---------------------------------------------------------------------------

describe("4) صفحة الدخول", () => {
  it("حقول كلمة المرور بزر العين في الدخول والتسجيل والتحديث", () => {
    assert.doesNotMatch(src("components/auth/AuthForm.tsx"), /type="password"/);
    assert.match(src("components/auth/AuthForm.tsx"), /<PasswordInput/);
    assert.match(src("components/auth/PasswordInput.tsx"), /type=\{shown \? "text" : "password"\}/);
    assert.match(src("components/auth/ResetForms.tsx"), /<PasswordInput name="password"[\s\S]*<PasswordInput name="confirm"/);
  });

  it("رابط «نسيت كلمة المرور؟» إلى /auth/reset، وصفحتا الطلب والتحديث موجودتان", () => {
    assert.match(src("components/auth/AuthForm.tsx"), /href="\/auth\/reset"/);
    assert.ok(existsSync(new URL("../app/[locale]/auth/reset/page.tsx", import.meta.url)));
    assert.ok(existsSync(new URL("../app/[locale]/auth/update-password/page.tsx", import.meta.url)));
    const actions = src("lib/auth/actions.ts");
    assert.match(actions, /resetPasswordForEmail\(email, \{\s*redirectTo: callbackUrl\(await siteOrigin\(\), `\/\$\{locale\}\/auth\/update-password`\)/);
    assert.match(actions, /updateUser\(\{ password \}\)/);
  });

  it("مفاتيح الصفحتين بكل اللغات", () => {
    const keys = ["showPassword", "hidePassword", "forgot", "resetTitle", "sendReset", "sentReset", "updateTitle", "newPassword", "confirmPassword", "savePassword", "errors.mismatch"];
    for (const l of locales) for (const k of keys) assert.ok(get(messages[l], `auth.${k}`), `${l}: auth.${k}`);
  });
});

// 5) المكتبة: استُبدلت في F1b بالواجهة البرمجية الرسمية (tests/f1b.test.ts).

// ---------------------------------------------------------------------------
// 6) صفحات about وeval وprivacy
// ---------------------------------------------------------------------------

describe("6) صفحات المعلومات بمحتوى حقيقي", () => {
  const pages: InfoPage[] = ["about", "eval", "privacy"];

  it("لكل لغة ولكل صفحة أقسام بنص", () => {
    for (const l of locales) {
      for (const page of pages) {
        const content = PAGE_CONTENT[l][page];
        assert.ok(content.sections.length >= 3, `${l}/${page}`);
        for (const s of content.sections) assert.ok(s.title.trim() && (s.paras?.length || s.items?.length), `${l}/${page}: ${s.title}`);
      }
    }
  });

  it("العربية والإنجليزية كاملتان: المسارات الثلاثة، والحارس بحالاته الثلاث، والحذف والتنزيل", () => {
    const text = (l: string, page: InfoPage) => JSON.stringify(pageContent(l, page));
    assert.match(text("ar", "about"), /\/new-muslim[\s\S]*\/discover/);
    assert.match(text("ar", "about"), /المختصون/);
    assert.match(text("ar", "eval"), /\(1\)[\s\S]*\(2\)[\s\S]*\(3\)/);
    assert.match(text("ar", "eval"), /ما لا يفعله/);
    assert.match(text("en", "eval"), /What it does not do/);
    assert.match(text("ar", "privacy"), /ما لا نجمعه[\s\S]*تنزيل بياناتي[\s\S]*حذف حسابي/);
    assert.match(text("en", "privacy"), /What we don't collect[\s\S]*Download my data[\s\S]*Delete my account/);
  });

  it("رابط المستودع في /eval بكل اللغات", () => {
    for (const l of locales) assert.ok(PAGE_CONTENT[l].eval.sections.some((s) => s.link?.href === REPO_URL), l);
  });

  it("لا اسم نموذج ولا شركة مزوّدة في محتوى الصفحات", () => {
    const all = JSON.stringify(PAGE_CONTENT);
    assert.doesNotMatch(all, /gemma|google|openrouter|openai|gpt|claude|anthropic|llama|mistral|qwen|deepseek/i);
  });

  it("الصفحات الثلاث تعرض المحتوى لا هيكل «قيد البناء»", () => {
    for (const page of pages) {
      const file = src(`app/[locale]/${page}/page.tsx`);
      assert.match(file, new RegExp(`<InfoPage page="${page}"`));
      assert.doesNotMatch(file, /<PagePlaceholder/);
    }
  });
});

// ---------------------------------------------------------------------------
// 7) التذييل
// ---------------------------------------------------------------------------

describe("7) التذييل", () => {
  it("عمود «عن المشروع» بلا «دخول»", () => {
    assert.deepEqual(footerProjectLinks.map((l) => l.href), ["/about", "/eval", "/privacy"]);
    assert.ok(!footerProjectLinks.some((l) => (l.href as string) === "/login"));
    assert.doesNotMatch(src("components/SiteFooter.tsx"), /\/login|footer\.login/);
  });
});

// ---------------------------------------------------------------------------
// 8) الصورة والنبذة
// ---------------------------------------------------------------------------

const UID = "11111111-1111-4111-8111-111111111111";

describe("8) «الصورة والنبذة»: ترتيب الأقسام والمدخلات", () => {
  it("ثانياً بعد «بياناتي» وقبل المواقيت عند الجميع", () => {
    // F2: حُذف قسم المواقيت من /me.
    assert.deepEqual(profileSections(false), ["account", "userCard"]);
    assert.deepEqual(profileSections(true), ["account", "expertCard"]);
  });

  it("الصورة في مجلد صاحبها فقط، والنبذة حتى الحد", () => {
    assert.deepEqual(parseProfileCardInput({ avatarPath: `${UID}/avatar-abc123.jpg`, bio: "  طالب علم  " }, UID), {
      avatarPath: `${UID}/avatar-abc123.jpg`,
      bio: "طالب علم",
    });
    assert.deepEqual(parseProfileCardInput({ avatarPath: null, bio: "" }, UID), { avatarPath: null, bio: null });
    assert.equal(parseProfileCardInput({ avatarPath: "22222222-2222-4222-8222-222222222222/avatar-abc123.jpg", bio: "" }, UID), null);
    assert.equal(parseProfileCardInput({ avatarPath: `${UID}/../x.jpg`, bio: "" }, UID), null);
    assert.equal(parseProfileCardInput({ avatarPath: null, bio: "x".repeat(BIO_MAX + 1) }, UID), null);
  });

  it("الصورة في زر «حسابي» وفي «الحوار»", () => {
    assert.match(src("components/AccountButton.tsx"), /menu\?\.avatarUrl &&/);
    assert.match(src("components/forum/ForumBits.tsx"), /author\.avatarUrl \?\? author\.expert\?\.avatarUrl/);
  });
});

describe("8) migration ‏20261012_profile_avatar_bio.sql على Postgres حقيقي", () => {
  const MIGRATION = readFileSync(new URL("../supabase/migrations/20261012_profile_avatar_bio.sql", import.meta.url), "utf8");
  const db = new PGlite();

  before(async () => {
    await db.exec(`
      create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;
      grant usage on schema public to authenticated;
      create table public.profiles (id uuid primary key, display_name text, preferred_lang text not null default 'ar');
      grant select on public.profiles to authenticated;
      grant update (display_name, preferred_lang) on public.profiles to authenticated;
      alter table public.profiles enable row level security;
      create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid());
      create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
      insert into public.profiles (id) values ('${UID}'), ('22222222-2222-4222-8222-222222222222');
    `);
    await db.exec(MIGRATION);
    await db.exec(MIGRATION); // آمن لإعادة التشغيل
  });

  async function asUser(sql: string) {
    await db.exec(`set role authenticated; select set_config('test.uid', '${UID}', false);`);
    try {
      return await db.query(sql);
    } finally {
      await db.exec("reset role;");
    }
  }

  it("المستخدم يحفظ صورته ونبذته في صفّه", async () => {
    await asUser(`update public.profiles set avatar_path = '${UID}/avatar-abc123.jpg', bio = 'نبذة' where id = '${UID}'`);
    const { rows } = await db.query<{ avatar_path: string; bio: string }>(`select avatar_path, bio from public.profiles where id = '${UID}'`);
    assert.deepEqual(rows[0], { avatar_path: `${UID}/avatar-abc123.jpg`, bio: "نبذة" });
  });

  it("لا صورة من مجلد غيره، ولا نبذة فوق 300 حرف، ولا صف غيره", async () => {
    await assert.rejects(asUser(`update public.profiles set avatar_path = 'other/avatar-abc123.jpg' where id = '${UID}'`), /profiles_avatar_path_own/);
    await assert.rejects(asUser(`update public.profiles set bio = repeat('x', 301) where id = '${UID}'`), /profiles_bio_length/);
    await asUser(`update public.profiles set bio = 'x' where id = '22222222-2222-4222-8222-222222222222'`);
    const { rows } = await db.query<{ bio: string | null }>(`select bio from public.profiles where id = '22222222-2222-4222-8222-222222222222'`);
    assert.equal(rows[0].bio, null);
  });
});
