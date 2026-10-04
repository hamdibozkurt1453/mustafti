/**
 * اختبارات S9 (بلا شبكة ولا قاعدة): مخطط طلب المختص، وحدود الوثائق ومساراتها،
 * وترتيب لوحة المختص، ومتى يُترجم الجواب.
 *   npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApplicationSchema, docProblem, isOwnDocPath, MAX_DOC_BYTES, needsTranslation, sortCases } from "../lib/experts/types";

const UID = "6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
const base = {
  displayName: "عبد الله",
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
