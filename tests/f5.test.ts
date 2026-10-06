/**
 * اختبارات F5 (بلا شبكة): الدخول التجريبي للتحكيم مقفل دون متغيريه، و«محادثاتي» في قائمة «حسابي»
 * وفي /me، وملفات الفيديو خالية من الاسم المحذوف، والهيرو بعرض الشاشة في الصفحات الداخلية.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ME_TABS, resolveTab } from "../lib/account/rules";
import { conversationHref } from "../lib/conversations/rules";
import { demoEmail, demoLoginEnabled } from "../lib/demo/rules";
import { CONVERSATIONS_ITEM } from "../lib/experts/menu-rules";
import { DISCOVER_DEBATES, DISCOVER_LECTURES, NEW_MUSLIM_STORIES, videosFor } from "../lib/explore/videos";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("F5 · الدخول التجريبي للتحكيم", () => {
  it("مقفل دون DEMO_LOGIN=true وكلمة المرور", () => {
    assert.equal(demoLoginEnabled({}), false);
    assert.equal(demoLoginEnabled({ DEMO_ACCOUNTS_PASSWORD: "x" }), false);
    assert.equal(demoLoginEnabled({ DEMO_LOGIN: "false", DEMO_ACCOUNTS_PASSWORD: "x" }), false);
    assert.equal(demoLoginEnabled({ DEMO_LOGIN: "true" }), false);
    assert.equal(demoLoginEnabled({ DEMO_LOGIN: "true", DEMO_ACCOUNTS_PASSWORD: "  " }), false);
    assert.equal(demoLoginEnabled({ DEMO_LOGIN: "true", DEMO_ACCOUNTS_PASSWORD: "x" }), true);
  });

  it("المسار يرفض (404) دون DEMO_LOGIN قبل أي شيء آخر", async () => {
    const prev = { ...process.env };
    delete process.env.DEMO_LOGIN;
    process.env.DEMO_ACCOUNTS_PASSWORD = "x";
    try {
      const { POST } = await import("../app/api/demo-login/route");
      const res = await POST(new Request("https://mustafti.com/api/demo-login", { method: "POST", body: JSON.stringify({ role: "user" }) }));
      assert.equal(res.status, 404);
    } finally {
      process.env = prev;
    }
  });

  it("ثلاثة حسابات فقط، ولا كلمة مرور في الكود", () => {
    assert.equal(demoEmail("user"), "user@mustafti.com");
    assert.equal(demoEmail("specialized"), "specialized@mustafti.com");
    assert.equal(demoEmail("admin"), "admin@mustafti.com");
    assert.equal(demoEmail("toString"), null);
    assert.equal(demoEmail("root"), null);
    const route = src("app/api/demo-login/route.ts");
    assert.match(route, /process\.env\.DEMO_ACCOUNTS_PASSWORD/);
    assert.doesNotMatch(route, /password:\s*["'`]/);
    assert.match(src("app/[locale]/layout.tsx"), /demoLoginEnabled\(\) && <DemoLogin \/>/);
    assert.match(src("components/DemoLogin.tsx"), /يُحذف|تُحذف/);
  });
});

describe("F5 · «محادثاتي»", () => {
  it("في قائمة «حسابي» قبل «لوحة المختص»، وبنصها", () => {
    assert.deepEqual(CONVERSATIONS_ITEM, { key: "conversations", href: "/me?tab=conversations" });
    const menu = src("lib/experts/menu.ts");
    assert.match(menu, /const items: AccountMenuItem\[\] = \[CONVERSATIONS_ITEM\];/);
    assert.ok(menu.indexOf("CONVERSATIONS_ITEM];") < menu.indexOf('key: "expertDashboard"'));
    const ar = JSON.parse(src("messages/ar.json"));
    assert.equal(ar.nav.accountMenu.conversations, "محادثاتي");
    assert.deepEqual(Object.keys(ar.nav.accountMenu).slice(0, 2), ["conversations", "expertDashboard"]);
    assert.equal(ar.me.tabs.conversations, "محادثاتي");
  });

  it("تبويب في /me يفتح أي محادثة في صفحتها", () => {
    assert.ok((ME_TABS as readonly string[]).includes("conversations"));
    assert.equal(resolveTab("conversations", false), "conversations");
    const id = "123e4567-e89b-12d3-a456-426614174000";
    assert.equal(conversationHref({ id, mode: "general" }), `/?c=${id}`);
    assert.equal(conversationHref({ id, mode: "new_muslim" }), `/new-muslim?c=${id}`);
    assert.equal(conversationHref({ id, mode: "discover" }), `/discover?c=${id}`);
    assert.match(src("components/chat/useConversations.ts"), /searchParams\.get\("c"\)/);
  });

  it("لا زر عائم خارج المحادثة، والشريط الجانبي باقٍ في المحادثة", () => {
    assert.doesNotMatch(src("components/home/HomeExperience.tsx"), /ConversationSidebar/);
    assert.doesNotMatch(src("components/chat/GuidedChat.tsx"), /ConversationSidebar/);
    assert.match(src("components/home/ChatView.tsx"), /<ConversationSidebar api=\{history\}/);
  });
});

describe("F5 · الفيديوهات", () => {
  it("ملفات الفيديو خالية من الاسم المحذوف", () => {
    for (const f of ["data/discover-videos.json", "data/new-muslim-stories.json"]) {
      const s = src(f);
      assert.doesNotMatch(s, /شمس الدين|Shams/i, f);
      assert.doesNotMatch(s, /7A1nEEVfjP4/, f);
    }
  });

  it("حدّ أدنى بالعربية: 6 قصص و4 محاضرات و3 مناظرات", () => {
    assert.ok(videosFor(NEW_MUSLIM_STORIES, "ar").videos.length >= 6);
    assert.ok(videosFor(DISCOVER_LECTURES, "ar").videos.length >= 4);
    assert.ok(videosFor(DISCOVER_DEBATES, "ar").videos.length >= 3);
  });

  it("البطاقة التي لا تُحمَّل صورتها تُخفى", () => {
    assert.match(src("components/explore/VideoGrid.tsx"), /naturalWidth <= 120/);
  });
});

describe("F5 · الهيرو بعرض الشاشة", () => {
  it("الصفحات الداخلية الست على PageHero وعرض 1200px", () => {
    assert.match(src("components/PageHero.tsx"), /max-w-\[1200px\]/);
    assert.match(src("components/PageHero.tsx"), /<GeometricPattern/);
    for (const f of ["components/chat/GuidedChat.tsx", "app/[locale]/library/page.tsx", "app/[locale]/forum/page.tsx", "components/InfoPage.tsx"]) {
      assert.match(src(f), /<PageHero>/, f);
      assert.match(src(f), /PAGE_WIDTH/, f);
    }
    assert.doesNotMatch(src("components/home/HomeExperience.tsx"), /PageHero/);
  });
});
