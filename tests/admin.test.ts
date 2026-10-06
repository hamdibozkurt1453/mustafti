/**
 * اختبارات S10 (بلا شبكة ولا قاعدة): تبويبات كل دور وأفعاله، وحساب الاطلاع viewer،
 * وانتقالات الملف، وحسابات الإحصاءات، وزر بلد السائل في الاستيضاح، ومفتاح FEATURE_EXTRAS.
 *   npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  averageAnswerMinutes,
  canClose,
  canReassign,
  CASE_ACTION_ROLES,
  formatDuration,
  percent,
  statsWindows,
  tabsFor,
} from "../lib/admin/rules";
import { ADMIN_ROLES, adminNeedsMfa, roleSatisfies } from "../lib/auth/role-rules";
import { withAskerCountry } from "../lib/case/flow";
import type { CasePlan, PlanQuestion } from "../lib/case/types";
import { EXTRAS_PATHS, FEATURE_EXTRAS, isEnabledHref } from "../lib/config";
import { navItems } from "../components/nav-items";
import { countryName } from "../lib/experts/countries";

describe("أدوار اللوحة", () => {
  it("التبويبات حسب الدور، وviewer يرى الكل", () => {
    assert.deepEqual(tabsFor("super_admin"), ["home", "experts", "cases", "forum", "newsletter", "stats"]);
    assert.deepEqual(tabsFor("reviewer"), ["home", "experts", "stats"]);
    assert.deepEqual(tabsFor("moderator"), ["home", "cases", "forum", "stats"]);
    assert.deepEqual(tabsFor("viewer"), ["home", "experts", "cases", "forum", "stats"]);
  });

  it("viewer بلا MFA، وبقية المشرفين بـ MFA", () => {
    assert.ok(ADMIN_ROLES.includes("viewer"));
    assert.equal(adminNeedsMfa("viewer"), false);
    for (const r of ["super_admin", "reviewer", "moderator"] as const) assert.equal(adminNeedsMfa(r), true);
  });

  it("viewer مرفوض في كل فعل", () => {
    assert.equal(roleSatisfies("viewer", CASE_ACTION_ROLES), false);
    assert.equal(roleSatisfies("viewer", ["super_admin", "reviewer"]), false);
    assert.equal(roleSatisfies("viewer", ["super_admin"]), false);
    assert.equal(roleSatisfies("moderator", CASE_ACTION_ROLES), true);
    assert.equal(roleSatisfies("reviewer", CASE_ACTION_ROLES), false);
    // يدخل اللوحة فقط.
    assert.equal(roleSatisfies("viewer", ADMIN_ROLES), true);
  });
});

describe("أفعال الملفات", () => {
  it("إعادة التوجيه للمسند فقط، والإغلاق لغير المغلق", () => {
    assert.equal(canReassign("assigned"), true);
    for (const s of ["submitted", "answered", "closed", "clarifying"]) assert.equal(canReassign(s), false);
    assert.equal(canClose("closed"), false);
    for (const s of ["submitted", "assigned", "answered"]) assert.equal(canClose(s), true);
  });
});

describe("الإحصاءات", () => {
  it("بداية اليوم بتوقيت الرياض، والأسبوع سبعة أيام", () => {
    // 22:30 بتوقيت غرينتش = 01:30 من اليوم التالي بالرياض.
    const { dayStart, weekStart } = statsWindows(new Date("2026-10-04T22:30:00Z"));
    assert.equal(dayStart.toISOString(), "2026-10-04T21:00:00.000Z");
    assert.equal(weekStart.toISOString(), "2026-09-28T21:00:00.000Z");
    assert.equal(statsWindows(new Date("2026-10-04T20:59:00Z")).dayStart.toISOString(), "2026-10-03T21:00:00.000Z");
  });

  it("النسبة، ومتوسط زمن أول جواب لكل ملف", () => {
    assert.equal(percent(1, 3), 33);
    assert.equal(percent(0, 0), null);
    assert.equal(averageAnswerMinutes([]), null);
    const avg = averageAnswerMinutes([
      { case_id: "a", case_created_at: "2026-10-04T10:00:00Z", created_at: "2026-10-04T11:00:00Z" },
      { case_id: "a", case_created_at: "2026-10-04T10:00:00Z", created_at: "2026-10-04T13:00:00Z" },
      { case_id: "b", case_created_at: "2026-10-04T10:00:00Z", created_at: "2026-10-04T10:30:00Z" },
    ]);
    assert.equal(avg, 45);
    const u = { d: "ي", h: "س", m: "د" };
    assert.equal(formatDuration(45, u), "45 د");
    assert.equal(formatDuration(125, u), "2 س 5 د");
    assert.equal(formatDuration(1500, u), "1 ي 1 س");
  });
});

describe("زر بلد السائل في الاستيضاح", () => {
  const q = (key: string, extra: Partial<PlanQuestion> = {}): PlanQuestion => ({
    key, text: key, textAr: key, why: "", whyAr: "", type: "text", options: [], required: false, ...extra,
  });
  const plan: CasePlan = { chapter: "divorce" as CasePlan["chapter"], lang: "en", questions: [q("when"), q("country")], known: [] };

  it("يضيف البلد باسمه العربي لسؤال البلد وحده، والكتابة الحرة باقية", () => {
    const name = countryName("SA", "ar")!;
    const out = withAskerCountry(plan, name);
    assert.deepEqual(out.questions[1].options, [{ value: name, label: name }]);
    assert.equal(out.questions[1].type, "text");
    assert.deepEqual(out.questions[0].options, []);
    assert.deepEqual(plan.questions[1].options, []); // لا يغيّر الأصل
  });

  it("بلا بلد صالح تبقى الخطة كما هي", () => {
    assert.equal(withAskerCountry(plan, countryName("??", "ar")), plan);
  });
});

describe("FEATURE_EXTRAS", () => {
  it("مُفعّلة: المسلم الجديد في الرأس (المواقيت والأذكار بطاقتان في الرئيسية منذ R2)", () => {
    assert.equal(FEATURE_EXTRAS, true);
    for (const p of EXTRAS_PATHS) assert.equal(isEnabledHref(p), true);
    assert.equal(isEnabledHref("/about"), true);
    for (const p of EXTRAS_PATHS) assert.ok(navItems.some((i) => i.href === p), p);
  });
});
