"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useState } from "react";
import { cityById, searchCities, type City } from "@/lib/prayer/cities";
import { savePrayerPrefs } from "@/lib/prayer/actions";
import {
  DEFAULT_SETTINGS,
  formatCountdown,
  loadSettings,
  METHODS,
  PRAYERS,
  prayerWindow,
  resolvePlace,
  storeSettings,
  dayTimes,
  type PrayerSettings,
} from "@/lib/prayer/times";

export function cityName(c: City, locale: string) {
  return locale === "ar" ? c.ar : c.en;
}

/**
 * `/prayer`: المواقيت محسوبة في المتصفح (adhan). الموقع من إذن المتصفح أو من قائمة مدن مضمّنة.
 * initial: اختيار المستخدم المسجّل من profiles (يُقدَّم عليه اختيار المتصفح إن وُجد).
 * signedIn: يُحفظ كل تغيير في الحساب أيضاً (معرّف المدينة والطريقة فقط، لا إحداثيات).
 */
export function PrayerTimesView({ initial, signedIn }: { initial: PrayerSettings | null; signedIn: boolean }) {
  const t = useTranslations("prayer");
  const tn = useTranslations("home.nextPrayer.names");
  const locale = useLocale();
  const [settings, setSettings] = useState<PrayerSettings>(initial ?? DEFAULT_SETTINGS);
  const [now, setNow] = useState<Date | null>(null);
  const [query, setQuery] = useState("");
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const listId = useId();

  // الاختيار المحفوظ في المتصفح، والساعة: في المتصفح فقط (لا اختلاف مع HTML الخادم).
  useEffect(() => {
    const stored = loadSettings();
    const first = setTimeout(() => {
      if (stored) setSettings(stored);
      setNow(new Date());
    }, 0);
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  function update(next: PrayerSettings) {
    setSettings(next);
    storeSettings(next);
    if (signedIn) {
      savePrayerPrefs({
        cityId: next.place.kind === "city" ? next.place.cityId : null,
        method: next.method,
        madhab: next.madhab,
      })
        .then((r) => setSaveError(!r.ok))
        .catch(() => setSaveError(true));
    }
  }

  function locate() {
    if (!navigator.geolocation) return setGeoError(true);
    setLocating(true);
    setGeoError(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // تقريب إلى منزلتين (نحو كيلومتر): يكفي للمواقيت، ويبقى في المتصفح.
        const round = (n: number) => Math.round(n * 100) / 100;
        update({ ...settings, place: { kind: "geo", lat: round(pos.coords.latitude), lng: round(pos.coords.longitude) } });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setGeoError(true);
      },
      { maximumAge: 3600_000, timeout: 10_000 },
    );
  }

  const minuteKey = now ? Math.floor(now.getTime() / 60000) : 0;
  const today = useMemo(() => (minuteKey ? dayTimes(settings, new Date(minuteKey * 60000)) : null), [settings, minuteKey]);
  const win = useMemo(
    () => (minuteKey ? prayerWindow(settings, new Date(minuteKey * 60000 + 59999)) : null),
    [settings, minuteKey],
  );
  const { tz } = resolvePlace(settings.place);
  const fmt = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: tz });
  const dateFmt = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: tz });
  const hijriFmt = new Intl.DateTimeFormat(`${locale}-u-ca-islamic-umalqura`, { day: "numeric", month: "long", year: "numeric", timeZone: tz });

  const city = settings.place.kind === "city" ? cityById(settings.place.cityId) : undefined;
  const placeLabel = city ? cityName(city, locale) : t("yourLocation");
  const results = searchCities(query);

  let progress = 0;
  let remaining = "--:--:--";
  if (now && win?.next && win.prev) {
    const total = win.next.at.getTime() - win.prev.at.getTime();
    const left = win.next.at.getTime() - now.getTime();
    progress = Math.min(1, Math.max(0, 1 - left / total));
    remaining = formatCountdown(left);
  }
  const R = 54;

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      {/* الصلاة القادمة */}
      <section className="relative isolate overflow-hidden rounded-[28px] bg-green-900 p-6 text-ivory-50 sm:p-8">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{ background: "radial-gradient(70% 90% at 85% 40%, rgb(255 184 0 / 0.13), transparent 70%)" }}
        />
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <div className="relative h-40 w-40 flex-none">
            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
              <circle cx="60" cy="60" r={R} fill="none" stroke="rgb(245 243 234 / 0.12)" strokeWidth="3" />
              <circle
                cx="60" cy="60" r={R} fill="none" stroke="var(--mf-gold-500)" strokeWidth="3.5" strokeLinecap="round"
                pathLength={1} strokeDasharray="1" strokeDashoffset={1 - progress}
                style={{ transition: "stroke-dashoffset 1s linear" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xs text-ivory-50/70">{t("in")}</span>
              <span dir="ltr" className="font-display text-[26px] font-semibold tabular-nums">{remaining}</span>
            </div>
          </div>
          <div className="text-center sm:text-start">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-500">{t("next")}</p>
            <p className="mt-1 font-display text-5xl font-semibold" aria-live="polite">
              {win?.next ? tn(win.next.name) : "…"}
            </p>
            <p className="mt-2 text-sm text-ivory-50/75">
              {win?.next && <>{fmt.format(win.next.at)} · </>}
              {placeLabel}
            </p>
          </div>
        </div>

        {/* جدول اليوم */}
        <div className="mt-8 rounded-2xl bg-ivory-50/5 p-4">
          {now && (
            <p className="mb-3 text-sm text-ivory-50/80">
              {dateFmt.format(now)} · <span className="text-gold-500">{hijriFmt.format(now)}</span>
            </p>
          )}
          <table className="w-full text-start">
            <caption className="sr-only">{t("todayTable")}</caption>
            <tbody>
              {PRAYERS.map((p) => {
                const isNext = win?.next?.name === p && today && win.next.at.getTime() === today[p].getTime();
                return (
                  <tr
                    key={p}
                    aria-current={isNext ? "time" : undefined}
                    className={`border-b border-ivory-50/10 last:border-0 ${isNext ? "text-gold-500" : p === "sunrise" ? "text-ivory-50/60" : ""}`}
                  >
                    <th scope="row" className="py-2.5 text-start font-semibold">{tn(p)}</th>
                    <td className="py-2.5 text-end tabular-nums">{today ? fmt.format(today[p]) : "--:--"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* الإعدادات */}
      <section className="rounded-[28px] border border-sand-200 bg-white p-6 sm:p-8">
        <h2 className="font-display text-xl font-semibold text-green-900">{t("location")}</h2>
        <p className="mt-1 text-sm text-ink-600">
          {t("current")}: <strong className="text-green-900">{placeLabel}</strong>
        </p>
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          className="mt-4 rounded-full bg-gold-500 px-5 py-2.5 text-sm font-semibold text-green-900 transition hover:brightness-105 disabled:opacity-60"
        >
          {locating ? t("locating") : t("useLocation")}
        </button>
        {geoError && <p role="alert" className="mt-2 text-sm text-alert-600">{t("geoError")}</p>}

        <label htmlFor={`${listId}-q`} className="mt-6 block text-sm font-semibold text-green-900">{t("searchCity")}</label>
        <input
          id={`${listId}-q`}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          autoComplete="off"
          aria-controls={`${listId}-list`}
          className="mt-2 w-full rounded-xl border border-sand-200 bg-ivory-50 px-4 py-2.5 text-green-900 outline-none focus:border-green-600"
        />
        {query.trim() && (
          <ul id={`${listId}-list`} className="mt-2 max-h-64 overflow-auto rounded-xl border border-sand-200">
            {results.length ? (
              results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      update({ ...settings, place: { kind: "city", cityId: c.id } });
                      setQuery("");
                    }}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-start text-green-900 hover:bg-green-900/5"
                  >
                    <span>{cityName(c, locale)}</span>
                    <span className="text-xs text-ink-600">{locale === "ar" ? c.en : c.country}</span>
                  </button>
                </li>
              ))
            ) : (
              <li className="px-4 py-2.5 text-sm text-ink-600">{t("noCity")}</li>
            )}
          </ul>
        )}

        <label htmlFor={`${listId}-m`} className="mt-6 block text-sm font-semibold text-green-900">{t("method")}</label>
        <select
          id={`${listId}-m`}
          value={settings.method}
          onChange={(e) => update({ ...settings, method: e.target.value as PrayerSettings["method"] })}
          className="mt-2 w-full rounded-xl border border-sand-200 bg-ivory-50 px-4 py-2.5 text-green-900"
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>{t(`methods.${m}`)}</option>
          ))}
        </select>

        <fieldset className="mt-6">
          <legend className="text-sm font-semibold text-green-900">{t("asr")}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["shafi", "hanafi"] as const).map((m) => (
              <label
                key={m}
                className={`cursor-pointer rounded-full border px-4 py-2 text-sm ${
                  settings.madhab === m ? "border-green-900 bg-green-900 text-ivory-50" : "border-sand-200 text-green-900"
                }`}
              >
                <input
                  type="radio"
                  name="madhab"
                  value={m}
                  checked={settings.madhab === m}
                  onChange={() => update({ ...settings, madhab: m })}
                  className="sr-only"
                />
                {t(`madhab.${m}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <p className="mt-6 rounded-xl bg-ivory-50 p-3 text-xs leading-relaxed text-ink-600">
          {t("privacy")} {signedIn ? t("savedAccount") : t("savedBrowser")}
          {saveError && <span className="block text-alert-600">{t("saveError")}</span>}
        </p>
      </section>
    </div>
  );
}
