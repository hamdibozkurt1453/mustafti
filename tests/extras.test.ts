/**
 * اختبارات S6 (بلا شبكة ولا قاعدة): المواقيت (المدن، والإعدادات، والحساب)، وقواعد الأذكار
 * (الدرجة، والعدد، والوقت، والأبواب)، والحساب التجريبي بلا MFA.
 *   npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CITIES, cityById, searchCities } from "../lib/prayer/cities";
import { dayTimes, decodeMethod, encodeMethod, METHODS, parseSettings, prayerWindow, DEFAULT_SETTINGS } from "../lib/prayer/times";
import { classifyCategory, hadeethencUrl, isAcceptedGrade, morningEvening, repeatCount } from "../lib/adhkar/rules";
import { adminNeedsMfa, isDemoNoMfaEmail, parseEmailList } from "../lib/auth/role-rules";

describe("المواقيت", () => {
  it("المدن: معرّفات فريدة، وإحداثيات صالحة، ومناطق زمنية معروفة", () => {
    assert.equal(new Set(CITIES.map((c) => c.id)).size, CITIES.length);
    assert.ok(CITIES.length >= 150);
    for (const c of CITIES) {
      assert.ok(Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180, c.id);
      assert.doesNotThrow(() => new Intl.DateTimeFormat("en", { timeZone: c.tz }), c.tz);
    }
  });

  it("البحث بالعربية بلا همزة وبالإنجليزية", () => {
    assert.equal(searchCities("اسطنبول")[0]?.id, "istanbul");
    assert.equal(searchCities("paris")[0]?.id, "paris");
    assert.equal(searchCities("القاهره")[0]?.id, "cairo");
    assert.deepEqual(searchCities("   "), []);
  });

  it("calc_method يحفظ الطريقة والمذهب معاً", () => {
    assert.equal(encodeMethod("Turkey", "hanafi"), "Turkey:hanafi");
    assert.equal(encodeMethod("UmmAlQura", "shafi"), "UmmAlQura");
    assert.deepEqual(decodeMethod("Turkey:hanafi"), { method: "Turkey", madhab: "hanafi" });
    assert.deepEqual(decodeMethod("Karachi"), { method: "Karachi", madhab: "shafi" });
    assert.equal(decodeMethod("Nope"), null);
    assert.equal(decodeMethod(null), null);
  });

  it("إعدادات المتصفح تُتحقق منها", () => {
    assert.equal(parseSettings({ place: { kind: "city", cityId: "atlantis" } }), null);
    assert.equal(parseSettings({ place: { kind: "geo", lat: 200, lng: 0 } }), null);
    assert.deepEqual(parseSettings({ place: { kind: "city", cityId: "london" }, method: "x", madhab: "hanafi" }), {
      place: { kind: "city", cityId: "london" },
      method: "UmmAlQura",
      madhab: "hanafi",
    });
  });

  it("مواقيت مكة مرتبة، والقادمة بعد الآن", () => {
    const now = new Date("2026-10-05T09:00:00Z");
    for (const method of METHODS) {
      const t = dayTimes({ ...DEFAULT_SETTINGS, method }, now);
      const order = [t.fajr, t.sunrise, t.dhuhr, t.asr, t.maghrib, t.isha].map((d) => d.getTime());
      assert.deepEqual([...order].sort((a, b) => a - b), order, method);
    }
    const w = prayerWindow(DEFAULT_SETTINGS, now);
    assert.ok(w.next.at > now && w.prev.at <= now);
    // 9:00 UTC = 12:00 بتوقيت مكة: القادمة الظهر أو العصر.
    assert.ok(["dhuhr", "asr"].includes(w.next.name));
  });

  it("العصر الحنفي بعد عصر الجمهور، وأوسلو صيفاً لها فجر وعشاء", () => {
    const now = new Date("2026-06-21T12:00:00Z");
    const shafi = dayTimes({ ...DEFAULT_SETTINGS, place: { kind: "city", cityId: "istanbul" } }, now);
    const hanafi = dayTimes({ ...DEFAULT_SETTINGS, place: { kind: "city", cityId: "istanbul" }, madhab: "hanafi" }, now);
    assert.ok(hanafi.asr > shafi.asr);
    const oslo = dayTimes({ ...DEFAULT_SETTINGS, method: "MuslimWorldLeague", place: { kind: "city", cityId: "oslo" } }, now);
    assert.ok(!Number.isNaN(oslo.fajr.getTime()) && !Number.isNaN(oslo.isha.getTime()));
    assert.ok(cityById("oslo"));
  });
});

describe("الأذكار", () => {
  it("لا يُدرج إلا الصحيح والحسن", () => {
    for (const g of ["صحيح", "حسن", "صحيح - رواه مسلم", "حَسَنٌ", "حسن صحيح", "Authentic", "Sahih", "Hasan/Sound"]) assert.ok(isAcceptedGrade(g), g);
    for (const g of ["ضعيف", "موضوع", "صحيح موقوفاً… وضعيف مرفوعاً", "Weak", "", null, undefined]) assert.equal(isAcceptedGrade(g), false, String(g));
  });

  it("العدد من لفظ الحديث فقط", () => {
    assert.equal(repeatCount("من قالها ثلاث مرات حين يصبح"), 3);
    assert.equal(repeatCount("من قال: سبحان الله وبحمده، في يوم مائة مرة"), 100);
    assert.equal(repeatCount("مَنْ قَالَ ... عَشْرَ مَرَّاتٍ"), 10);
    assert.equal(repeatCount("يقولها مرتين"), 2);
    assert.equal(repeatCount("من سبح الله في دبر كل صلاة ثلاثا وثلاثين، وحمد الله ثلاثا وثلاثين، وكبر الله ثلاثا وثلاثين"), 33);
    assert.equal(repeatCount("اللهم بك أصبحنا وبك أمسينا"), null);
    assert.equal(repeatCount("ثلاث مرات ... سبع مرات"), null);
  });

  it("الصباح والمساء من لفظه", () => {
    assert.deepEqual(morningEvening("كان إذا أصبح قال"), ["morning"]);
    assert.deepEqual(morningEvening("وإذا أمسى قال"), ["evening"]);
    assert.deepEqual(morningEvening("إذا أصبح وإذا أمسى"), ["morning", "evening"]);
    assert.deepEqual(morningEvening("سيد الاستغفار"), ["morning", "evening"]);
  });

  it("الأبواب والروابط", () => {
    assert.equal(classifyCategory("أذكار الصباح والمساء"), "morningEvening");
    assert.equal(classifyCategory("الأذكار بعد الصلاة"), "afterPrayer");
    assert.equal(classifyCategory("أذكار النوم"), null);
    assert.equal(hadeethencUrl("5401", "en"), "https://hadeethenc.com/en/browse/hadith/5401");
  });
});

describe("الحساب التجريبي بلا MFA", () => {
  const list = " Demo@Example.com, judge@mustafti.com ,, bad ";
  it("القائمة مفصولة بفواصل وبلا حساسية للحروف", () => {
    assert.deepEqual([...parseEmailList(list)], ["demo@example.com", "judge@mustafti.com"]);
    assert.ok(isDemoNoMfaEmail("demo@example.com", list));
    assert.ok(isDemoNoMfaEmail("JUDGE@mustafti.com", list));
  });
  it("لا يُطبَّق على غيرها أبداً", () => {
    assert.equal(isDemoNoMfaEmail("other@example.com", list), false);
    assert.equal(isDemoNoMfaEmail("demo@example.com.evil", list), false);
    assert.equal(isDemoNoMfaEmail(null, list), false);
    assert.equal(isDemoNoMfaEmail("demo@example.com", undefined), false);
    assert.equal(isDemoNoMfaEmail("", ""), false);
  });
  it("MFA يسقط للتجريبي فقط", () => {
    assert.equal(adminNeedsMfa("super_admin"), true);
    assert.equal(adminNeedsMfa("super_admin", true), false);
    assert.equal(adminNeedsMfa("viewer"), false);
  });
});
