"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { PrayerSettingsForm } from "@/components/prayer/PrayerSettingsForm";
import { savePrayerPrefs } from "@/lib/prayer/actions";
import { DEFAULT_SETTINGS, storeSettings, type PrayerSettings } from "@/lib/prayer/times";

/**
 * «المدينة وطريقة حساب المواقيت» في تبويب الملف: تُحفظ في الحساب (معرّف المدينة والطريقة فقط)
 * وفي هذا المتصفح، فتظهر في بطاقة المواقيت في الرئيسية. بلا «موقعي» هنا: الحساب لا يحفظ إحداثيات.
 */
export function MePrayerSettings({ initial }: { initial: PrayerSettings | null }) {
  const t = useTranslations("prayer");
  const [settings, setSettings] = useState<PrayerSettings>(initial ?? DEFAULT_SETTINGS);
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");

  function update(next: PrayerSettings) {
    setSettings(next);
    storeSettings(next);
    savePrayerPrefs({
      cityId: next.place.kind === "city" ? next.place.cityId : null,
      method: next.method,
      madhab: next.madhab,
    })
      .then((r) => setState(r.ok ? "saved" : "error"))
      .catch(() => setState("error"));
  }

  return (
    <div>
      <PrayerSettingsForm settings={settings} onChange={update} tone="light" allowGeo={false} />
      <p role="status" className="mt-4 text-xs text-ink-600">
        {state === "error" ? <span className="text-alert-600">{t("saveError")}</span> : state === "saved" ? t("savedAccount") : t("privacy")}
      </p>
    </div>
  );
}
