"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import type { Dhikr } from "@/lib/adhkar/store";
import { dhikrMoment } from "@/lib/adhkar/moment";
import type { GeoPlace } from "@/lib/prayer/geo";
import { cityById, DEFAULT_CITY_ID } from "@/lib/prayer/cities";
import {
  DEFAULT_SETTINGS,
  dayTimes,
  formatCountdown,
  PRAYERS,
  prayerWindow,
  resolvePlace,
  type PrayerSettings,
} from "@/lib/prayer/times";

/**
 * بطاقة المواقيت في الرئيسية (R2): الصلاة القادمة بعدّ تنازلي، وجدول اليوم.
 * F2: الموقع آلي من ترويسات Vercel الجغرافية (/api/geo، في الخادم، بلا إذن ولا تخزين)، والاحتياط مكة،
 * وطريقة الحساب من البلد. وبدل زر «تغيير المدينة والطريقة»: بطاقة «ذِكر الآن» بالذكر المناسب للوقت
 * (قبل الصلاة، وبعدها، والصباح، والمساء، والنوم، والاستيقاظ) ورابط «كل الأذكار».
 */
export function PrayerCard({ adhkar = [] }: { adhkar?: Dhikr[] }) {
  const t = useTranslations("prayer");
  const ta = useTranslations("adhkar");
  const tn = useTranslations("home.nextPrayer.names");
  const locale = useLocale();
  const [now, setNow] = useState<Date | null>(null);
  const [settings, setSettings] = useState<PrayerSettings>(DEFAULT_SETTINGS);
  const [geo, setGeo] = useState<GeoPlace | null>(null);

  useEffect(() => {
    // الوقت يُقرأ في المتصفح فقط، حتى لا يختلف عن HTML المولّد في الخادم.
    const first = setTimeout(() => setNow(new Date()), 0);
    const id = setInterval(() => setNow(new Date()), 1000);
    let live = true;
    fetch("/api/geo", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<GeoPlace>) : null))
      .then((g) => {
        if (!live || !g || !Number.isFinite(g.lat) || !Number.isFinite(g.lng)) return;
        setGeo(g);
        if (!g.fallback)
          setSettings({ place: { kind: "geo", lat: g.lat, lng: g.lng, tz: g.tz ?? undefined }, method: g.method, madhab: "shafi" });
      })
      .catch(() => {});
    return () => {
      live = false;
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  // نعيد الحساب كل دقيقة فقط، لا كل ثانية.
  const minuteKey = now ? Math.floor(now.getTime() / 60000) : 0;
  const today = useMemo(() => (minuteKey ? dayTimes(settings, new Date(minuteKey * 60000)) : null), [settings, minuteKey]);
  const win = useMemo(
    () => (minuteKey ? prayerWindow(settings, new Date(minuteKey * 60000 + 59999)) : null),
    [settings, minuteKey],
  );

  const { tz } = resolvePlace(settings.place);
  const fmt = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: tz });
  const dateFmt = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: tz });
  const hijriFmt = new Intl.DateTimeFormat(`${locale}-u-ca-islamic-umalqura`, { day: "numeric", month: "long", year: "numeric", timeZone: tz });
  const makkah = cityById(DEFAULT_CITY_ID)!;
  const placeLabel = geo && !geo.fallback ? (geo.city ?? t("yourLocation")) : locale === "ar" ? makkah.ar : makkah.en;

  // «ذِكر الآن»: الفئة من مواقيت اليوم، وأول ذكر فيها للمعاينة.
  const moment = now && today ? dhikrMoment(now, today) : null;
  const preview = moment ? adhkar.find((d) => d.occasions.includes(moment.occasion)) : undefined;

  const R = 54;
  let progress = 0;
  let remaining = "--:--:--";
  if (now && win?.next && win.prev) {
    const total = win.next.at.getTime() - win.prev.at.getTime();
    const left = Math.max(0, win.next.at.getTime() - now.getTime());
    progress = Math.min(1, Math.max(0, 1 - left / total));
    remaining = formatCountdown(left);
  }

  return (
    <section id="prayer" aria-labelledby="prayer-title" className="scroll-mt-24">
      <div className="mf-lift relative isolate overflow-hidden rounded-[32px] bg-green-900 p-6 text-ivory-50 sm:p-9">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{ background: "radial-gradient(70% 90% at 85% 30%, rgb(255 184 0 / 0.13), transparent 70%)" }}
        />

        <div className="grid items-center gap-8 lg:grid-cols-[auto_1fr_minmax(0,22rem)]">
          {/* القوس الدائري */}
          <div className="relative mx-auto h-40 w-40 flex-none sm:h-48 sm:w-48">
            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
              <circle cx="60" cy="60" r={R} fill="none" stroke="rgb(245 243 234 / 0.12)" strokeWidth="3" />
              <circle
                cx="60" cy="60" r={R} fill="none" stroke="var(--mf-gold-500)" strokeWidth="3.5" strokeLinecap="round"
                pathLength={1} strokeDasharray="1" strokeDashoffset={1 - progress}
                className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-1000 motion-safe:ease-linear"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xs text-ivory-50/70">{t("in")}</span>
              <span dir="ltr" className="font-display text-[26px] font-semibold tabular-nums sm:text-[30px]">{remaining}</span>
            </div>
          </div>

          <div className="text-center lg:text-start">
            <p id="prayer-title" className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-500">{t("next")}</p>
            <p className="mt-2 font-display text-5xl font-semibold sm:text-6xl" aria-live="polite">
              {win?.next ? tn(win.next.name) : "…"}
            </p>
            <p className="mt-3 text-sm text-ivory-50/75">
              {win?.next && (
                <>
                  <span className="font-semibold text-ivory-50">{fmt.format(win.next.at)}</span> ·{" "}
                </>
              )}
              {placeLabel}
            </p>
            {now && (
              <p className="mt-1 text-xs text-ivory-50/60">
                {dateFmt.format(now)} · <span className="text-gold-500">{hijriFmt.format(now)}</span>
              </p>
            )}
<p className="mt-2 text-[11px] text-ivory-50/50">
              {t("method")}: {t(`methods.${settings.method}`)} · {t("autoLocation")}
            </p>
          </div>

          {/* جدول اليوم */}
          <div className="rounded-2xl bg-ivory-50/[0.06] p-4">
            <table className="w-full text-start">
              <caption className="mb-2 text-start text-xs font-semibold uppercase tracking-[0.15em] text-ivory-50/60">{t("todayTable")}</caption>
              <tbody>
                {PRAYERS.map((p) => {
                  const isNext = win?.next?.name === p && today && win.next.at.getTime() === today[p].getTime();
                  return (
                    <tr
                      key={p}
                      aria-current={isNext ? "time" : undefined}
                      className={`border-b border-ivory-50/10 transition-colors last:border-0 ${
                        isNext ? "text-gold-500" : p === "sunrise" ? "text-ivory-50/55" : ""
                      }`}
                    >
                      <th scope="row" className="py-2 text-start font-semibold">
                        {isNext && <span aria-hidden className="me-2 inline-block h-1.5 w-1.5 rounded-full bg-gold-500 align-middle" />}
                        {tn(p)}
                      </th>
                      <td className="py-2 text-end tabular-nums">{today ? fmt.format(today[p]) : "--:--"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* F2: «ذِكر الآن» */}
        <div data-testid="dhikr-now" className="mt-8 flex flex-col gap-4 rounded-2xl border border-gold-500/25 bg-ivory-50/[0.05] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-500">{ta("now")}</p>
            <p className="mt-1 font-display text-xl font-semibold" aria-live="polite">
              {moment ? ta(`moments.${moment.occasion}`) : "…"}
            </p>
            {preview && (
              <p lang="ar" dir="rtl" className="mt-2 line-clamp-2 font-display leading-loose text-ivory-50/80">
                {preview.text}
              </p>
            )}
          </div>
          <div className="flex flex-none flex-wrap gap-2">
            {moment && (
              <Link
                href={{ pathname: "/adhkar", query: { c: moment.occasion } }}
                className="mf-press rounded-full bg-gold-500 px-5 py-2.5 text-sm font-semibold text-green-900 hover:brightness-105"
              >
                {ta("openNow")}
              </Link>
            )}
            <Link
              href="/adhkar"
              className="mf-press rounded-full border border-ivory-50/25 px-5 py-2.5 text-sm font-semibold text-ivory-50 hover:border-gold-500 hover:text-gold-500"
            >
              {ta("all")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
