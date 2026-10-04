/**
 * اختبارات S9 (بلا شبكة ولا قاعدة): مخطط طلب المختص، وحدود الوثائق ومساراتها،
 * وترتيب لوحة المختص، ومتى يُترجم الجواب.
 *   npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chapterAr, chapterOptionsAr, languageName, shortDateTime } from "../lib/experts/format";
import {
  ApplicationSchema,
  docProblem,
  isOwnAvatarPath,
  isOwnDocPath,
  makeSlug,
  MAX_DOC_BYTES,
  needsTranslation,
  normalizeSocial,
  ProfileEditSchema,
  sortCases,
} from "../lib/experts/types";

const UID = "6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
const base = {
  displayName: "عبد الله",
  bio: "مدرّس فقه حنفي منذ عشر سنوات، وأجيب بالعربية والتركية.",
  role: "mufti",
  specialty: "الفقه الحنفي",
  country: "تركيا",
  languages: ["ar", "tr"],
  traditional: false,
  degree: "ماجستير",
  institution: "جامعة إسطنبول",
  gradYear: 2015,
  tazkiyat: [],
  docPaths: [`${UID}/0f1e2d3c-4b5a-4968-8776-655443322110.pdf`],
  pledge: true,
};

describe("طلب المختص", () => {
  it("يقبل طلباً كاملاً", () => assert.ok(ApplicationSchema.safeParse(base).success));
  it("يشترط الإقرار", () => assert.ok(!ApplicationSchema.safeParse({ ...base, pledge: false }).success));
  it("يشترط وثيقة أو تزكية", () => assert.ok(!ApplicationSchema.safeParse({ ...base, docPaths: [] }).success));
  it("التقليدي يشترط تزكية ولا يشترط الدرجة", () => {
    const trad = { ...base, traditional: true, degree: "", institution: "", gradYear: null, docPaths: [] };
    assert.ok(!ApplicationSchema.safeParse(trad).success);
    assert.ok(ApplicationSchema.safeParse({ ...trad, tazkiyat: [{ scholar: "الشيخ فلان", contact: "+90 555" }] }).success);
  });
  it("النبذة إلزامية وحتى 500 حرف", () => {
    assert.ok(!ApplicationSchema.safeParse({ ...base, bio: "" }).success);
    assert.ok(!ApplicationSchema.safeParse({ ...base, bio: "ا".repeat(501) }).success);
  });
  it("الحسابات والتواصل اختيارية، وصيغتها تُفحص", () => {
    const ok = ApplicationSchema.safeParse({
      ...base,
      contact: { phone: "+90 555 123 4567", email: "a@b.co" },
      socials: { x: "x.com/someone", website: "https://example.org" },
    });
    assert.ok(ok.success);
    assert.equal(ok.data.socials.x, "https://x.com/someone");
    assert.ok(!ApplicationSchema.safeParse({ ...base, socials: { x: "https://evil.example/x" } }).success);
    assert.ok(!ApplicationSchema.safeParse({ ...base, contact: { phone: "call me", email: "" } }).success);
  });
  it("يرفض دوراً غير معروف", () => assert.ok(!ApplicationSchema.safeParse({ ...base, role: "admin" }).success));
});

describe("الوثائق", () => {
  it("PDF وصور فقط، وحتى 10MB", () => {
    assert.equal(docProblem({ type: "application/pdf", size: 1000 }), null);
    assert.equal(docProblem({ type: "image/png", size: MAX_DOC_BYTES }), null);
    assert.equal(docProblem({ type: "image/png", size: MAX_DOC_BYTES + 1 }), "size");
    assert.equal(docProblem({ type: "text/html", size: 10 }), "type");
  });
  it("المسار في مجلد صاحب الطلب فقط", () => {
    assert.ok(isOwnDocPath(base.docPaths[0], UID));
    assert.ok(!isOwnDocPath(base.docPaths[0], "00000000-0000-4000-8000-000000000000"));
    assert.ok(!isOwnDocPath(`${UID}/../x.pdf`, UID));
  });
});

describe("لوحة المختص", () => {
  it("الأولوية العالية ثم الأقدم", () => {
    const rows = [
      { id: "a", priority: "normal", created_at: "2026-10-04T08:00:00+00:00" },
      { id: "b", priority: "high", created_at: "2026-10-04T10:00:00+00:00" },
      { id: "c", priority: "high", created_at: "2026-10-04T09:00:00+00:00" },
      { id: "d", priority: null, created_at: "2026-10-04T07:00:00+00:00" },
    ];
    assert.deepEqual(sortCases(rows).map((r) => r.id), ["c", "b", "d", "a"]);
  });
  it("يُترجم الجواب لغير العربية فقط", () => {
    assert.equal(needsTranslation("ar"), false);
    assert.equal(needsTranslation("ar-SA"), false);
    assert.equal(needsTranslation(null), false);
    assert.equal(needsTranslation("tr"), true);
  });
});

describe("الملف الشخصي", () => {
  it("روابط الحسابات: نطاق المنصة نفسها، وhttp(s) فقط", () => {
    assert.equal(normalizeSocial("youtube", "https://www.youtube.com/@channel"), "https://www.youtube.com/@channel");
    assert.equal(normalizeSocial("telegram", "t.me/name"), "https://t.me/name");
    assert.equal(normalizeSocial("x", "https://x.com/"), null);
    assert.equal(normalizeSocial("facebook", "https://facebook.com.evil.io/a"), null);
    assert.equal(normalizeSocial("website", "javascript:alert(1)"), null);
    assert.equal(normalizeSocial("website", "https://user:pw@example.org"), null);
  });
  it("تعديل الملف لا يقبل الاسم ولا الدور (حقول المراجعة)", () => {
    const parsed = ProfileEditSchema.safeParse({
      bio: "نبذة كافية للاختبار هنا.",
      avatarPath: null,
      contact: { phone: "", email: "" },
      socials: {},
      role: "mufti",
    });
    assert.ok(parsed.success);
    assert.ok(!("role" in parsed.data));
  });
  it("مسار الصورة في مجلد صاحبها فقط", () => {
    assert.ok(isOwnAvatarPath(`${UID}/avatar-0123456789abcdef.jpg`, UID));
    assert.ok(!isOwnAvatarPath(`00000000-0000-4000-8000-000000000000/avatar-0123456789abcdef.jpg`, UID));
    assert.ok(!isOwnAvatarPath(`${UID}/avatar-x.svg`, UID));
  });
  it("الرابط العام: لاتيني من الاسم ثم لاحقة، أو expert-", () => {
    assert.equal(makeSlug("Abdullah Yılmaz", "a1b2c3"), "abdullah-yilmaz-a1b2c3");
    assert.equal(makeSlug("عبد الله", "a1b2c3"), "expert-a1b2c3");
    assert.match(makeSlug("join", "a1b2c3"), /^join-a1b2c3$/);
  });
});

describe("سطر بيانات الملف", () => {
  it("الأبواب الأربعة عشر بالعربية ثم «أخرى»", () => {
    const opts = chapterOptionsAr();
    assert.equal(opts.length, 15);
    assert.equal(opts.at(-1)?.label, "أخرى");
    assert.ok(!opts.some((o) => /[a-z_]/.test(o.label)));
    assert.equal(chapterAr("talaq_khul"), "الطلاق والخلع");
    assert.equal(chapterAr(null), "أخرى");
  });
  it("اسم اللغة لا رمزها، والتاريخ بأرقام لاتينية وبتوقيت الرياض", () => {
    assert.equal(languageName("ar", "ar"), "العربية");
    assert.equal(shortDateTime("2026-10-04T12:25:00Z", "ar"), "4 أكتوبر، 3:25 م");
  });
});
