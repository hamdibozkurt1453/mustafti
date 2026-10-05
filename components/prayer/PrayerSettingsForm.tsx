"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { searchCities, type City } from "@/lib/prayer/cities";
import { METHODS, type PrayerSettings } from "@/lib/prayer/times";

export function cityName(c: City, locale: string) {
  return locale === "ar" ? c.ar : c.en;
}

type Props = {
  settings: PrayerSettings;
  onChange: (next: PrayerSettings) => void;
  /** dark: داخل بطاقة المواقيت الخضراء في الرئيسية؛ light: في تبويب الملف في /me. */
  tone: "dark" | "light";
  /** زر «استعمل موقعي» (يبقى الموقع في المتصفح فقط). لا يظهر في /me لأن الحساب يحفظ المدينة وحدها. */
  allowGeo?: boolean;
};

/** تغيير المدينة وطريقة الحساب ووقت العصر. مشترك بين بطاقة المواقيت في الرئيسية وتبويب الملف في /me. */
export function PrayerSettingsForm({ settings, onChange, tone, allowGeo = true }: Props) {
  const t = useTranslations("prayer");
  const locale = useLocale();
  const id = useId();
  const [query, setQuery] = useState("");
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState(false);
  const results = searchCities(query);
  const dark = tone === "dark";

  const label = `block text-sm font-semibold ${dark ? "text-ivory-50" : "text-green-900"}`;
  const field = dark
    ? "mt-2 w-full rounded-xl border border-ivory-50/15 bg-ivory-50/[0.06] px-4 py-2.5 text-ivory-50 outline-none placeholder:text-ivory-50/45 focus:border-gold-500"
    : "mt-2 w-full rounded-xl border border-sand-200 bg-ivory-50 px-4 py-2.5 text-green-900 outline-none focus:border-green-600";

  function locate() {
    if (!navigator.geolocation) return setGeoError(true);
    setLocating(true);
    setGeoError(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // تقريب إلى منزلتين (نحو كيلومتر): يكفي للمواقيت، ويبقى في المتصفح.
        const round = (n: number) => Math.round(n * 100) / 100;
        onChange({ ...settings, place: { kind: "geo", lat: round(pos.coords.latitude), lng: round(pos.coords.longitude) } });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setGeoError(true);
      },
      { maximumAge: 3600_000, timeout: 10_000 },
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div>
        <label htmlFor={`${id}-q`} className={label}>{t("searchCity")}</label>
        <input
          id={`${id}-q`}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          autoComplete="off"
          aria-controls={`${id}-list`}
          className={field}
        />
        {query.trim() && (
          <ul
            id={`${id}-list`}
            className={`mf-drop mt-2 max-h-56 overflow-auto rounded-xl border ${dark ? "border-ivory-50/15 bg-green-900" : "border-sand-200 bg-white"}`}
          >
            {results.length ? (
              results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange({ ...settings, place: { kind: "city", cityId: c.id } });
                      setQuery("");
                    }}
                    className={`flex w-full items-center justify-between px-4 py-2.5 text-start transition-colors ${
                      dark ? "text-ivory-50 hover:bg-ivory-50/10" : "text-green-900 hover:bg-green-900/5"
                    }`}
                  >
                    <span>{cityName(c, locale)}</span>
                    <span className={`text-xs ${dark ? "text-ivory-50/60" : "text-ink-600"}`}>{locale === "ar" ? c.en : c.country}</span>
                  </button>
                </li>
              ))
            ) : (
              <li className={`px-4 py-2.5 text-sm ${dark ? "text-ivory-50/70" : "text-ink-600"}`}>{t("noCity")}</li>
            )}
          </ul>
        )}
        {allowGeo && (
          <button
            type="button"
            onClick={locate}
            disabled={locating}
            className="mf-press mt-3 rounded-full bg-gold-500 px-4 py-2 text-sm font-semibold text-green-900 hover:brightness-105 disabled:opacity-60"
          >
            {locating ? t("locating") : t("useLocation")}
          </button>
        )}
        {geoError && <p role="alert" className={`mt-2 text-sm ${dark ? "text-gold-500" : "text-alert-600"}`}>{t("geoError")}</p>}
      </div>

      <div>
        <label htmlFor={`${id}-m`} className={label}>{t("method")}</label>
        <select
          id={`${id}-m`}
          value={settings.method}
          onChange={(e) => onChange({ ...settings, method: e.target.value as PrayerSettings["method"] })}
          className={`${field} ${dark ? "[&>option]:text-green-900" : ""}`}
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>{t(`methods.${m}`)}</option>
          ))}
        </select>

        <fieldset className="mt-4">
          <legend className={label}>{t("asr")}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["shafi", "hanafi"] as const).map((m) => {
              const on = settings.madhab === m;
              return (
                <label
                  key={m}
                  className={`mf-press cursor-pointer rounded-full border px-4 py-2 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-gold-500 ${
                    on
                      ? dark
                        ? "border-gold-500 bg-gold-500 font-semibold text-green-900"
                        : "border-green-900 bg-green-900 text-ivory-50"
                      : dark
                        ? "border-ivory-50/20 text-ivory-50 hover:border-gold-500/70"
                        : "border-sand-200 text-green-900 hover:border-green-600"
                  }`}
                >
                  <input
                    type="radio"
                    name={`${id}-madhab`}
                    value={m}
                    checked={on}
                    onChange={() => onChange({ ...settings, madhab: m })}
                    className="sr-only"
                  />
                  {t(`madhab.${m}`)}
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>
    </div>
  );
}
