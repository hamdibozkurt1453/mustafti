/**
 * ترتيب عرض الحالة D (بلا شبكة): التمهيد، ثم بطاقة الإحالة وزر «أرسل مسألتي لمختص»، ثم الفتاوى المنشورة.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("ترتيب الإحالة إلى مختص", () => {
  it("بطاقة الإحالة قبل المصادر والفتاوى المنشورة", () => {
    const s = src("components/chat/BotReply.tsx");
    const referral = s.indexOf('t("sendCase")');
    assert.ok(referral > 0);
    assert.ok(referral < s.indexOf("<SourceCard"));
    assert.ok(referral < s.indexOf("<FatwaList"));
  });

  it("سطر «بلا هوية» مترجم بكل اللغات", () => {
    for (const l of ["ar", "en", "id", "ur", "bn", "tr", "fa", "fr", "ms", "ru", "sw", "ha"]) {
      const m = JSON.parse(src(`messages/${l}.json`)) as { chat: Record<string, string> };
      assert.ok(m.chat.sendCaseAnon, l);
    }
  });
});
