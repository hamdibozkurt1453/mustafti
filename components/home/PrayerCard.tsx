"use client";

import { CalculationMethod, Coordinates, PrayerTimes } from "adhan";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";

type PrayerName = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
const NAMES: PrayerName[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

type Place = { lat: number; lng: number; tz: string | undefined; label: "defaultCity" | "yourLocation" };

// الافتراضي: مكة المكرمة بتقويم أم القرى، حتى يختار الزائر موقعه.
const MAKKAH: Place = { lat: 21.4225, lng: 39.8262, tz: "Asia/Riyadh", label: "defaultCity" };

/** يرتّب صلوات الأمس واليوم والغد، ويعيد السابقة والقادمة بالنسبة إلى الآن. */
function window(place: Place, now: Date) {
  const coords = new Coordinates(place.lat, place.lng);
  const params =
    place.label === "defaultCity" ? CalculationMethod.UmmAlQura() : CalculationMethod.MuslimWorldLeague();
  const all: { name: PrayerName; at: Date }[] = [];
  for (const offset of [-1, 0, 1]) {
    const day = new Date(now);
    day.setDate(day.getDate() + offset);
    const pt = new PrayerTimes(coords, day, params);
    for (const n of NAMES) all.push({ name: n, at: pt[n] });
  }
  all.sort((a, b) => a.at.getTime() - b.at.getTime());
  const nextIdx = all.findIndex((p) => p.at > now);
  return { prev: all[nextIdx - 1], next: all[nextIdx] };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** بطاقة الصلاة القادمة: عدّ تنازلي حي وقوس يتقدم من الصلاة السابقة إلى القادمة. */
export function PrayerCard() {
  const t = useTranslations("home.nextPrayer");
  const locale = useLocale();
  const [now, setNow] = useState<Date | null>(null);
  const [place, setPlace] = useState<Place>(MAKKAH);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    // الوقت يُقرأ في المتصفح فقط، حتى لا يختلف عن HTML المولّد في الخادم.
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  // نعيد الحساب كل دقيقة فقط، لا كل ثانية.
  const minuteKey = now ? Math.floor(now.getTime() / 60000) : 0;
  const win = useMemo(
    () => (minuteKey ? window(place, new Date(minuteKey * 60000 + 59999)) : null),
    [place, minuteKey],
  );

  function locate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPlace({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          tz: undefined,
          label: "yourLocation",
        });
        setLocating(false);
      },
      () => setLocating(false),
      { maximumAge: 3600_000, timeout: 10_000 },
    );
  }

  const R = 54;
  let progress = 0;
  let remaining = "--:--:--";
  let timeLabel = "";
  if (now && win?.next && win.prev) {
    const total = win.next.at.getTime() - win.prev.at.getTime();
    const left = Math.max(0, win.next.at.getTime() - now.getTime());
    progress = Math.min(1, Math.max(0, 1 - left / total));
    const s = Math.floor(left / 1000);
    remaining = `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
    timeLabel = new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: place.tz,
    }).format(win.next.at);
  }

  return (
    <section className="bg-ivory-50">
      <div className="mx-auto max-w-6xl px-4 pb-20 sm:pb-28">
        <div className="relative isolate overflow-hidden rounded-[32px] bg-green-900 p-6 text-ivory-50 sm:p-10">
          <div
            aria-hidden
            className="absolute inset-0 -z-10"
            style={{ background: "radial-gradient(70% 90% at 85% 50%, rgb(255 184 0 / 0.13), transparent 70%)" }}
          />
          <div className="flex flex-col items-center gap-8 sm:flex-row sm:gap-12">
            {/* القوس الدائري */}
            <div className="relative h-44 w-44 flex-none sm:h-52 sm:w-52">
              <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
                <circle cx="60" cy="60" r={R} fill="none" stroke="rgb(245 243 234 / 0.12)" strokeWidth="3" />
                <circle
                  cx="60"
                  cy="60"
                  r={R}
                  fill="none"
                  stroke="var(--mf-gold-500)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  pathLength={1}
                  strokeDasharray="1"
                  strokeDashoffset={1 - progress}
                  style={{ transition: "stroke-dashoffset 1s linear" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs text-ivory-50/70">{t("in")}</span>
                <span dir="ltr" className="font-display text-[28px] font-semibold tabular-nums sm:text-[32px]">
                  {remaining}
                </span>
              </div>
            </div>

            <div className="flex-1 text-center sm:text-start">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-500">{t("title")}</p>
              <p className="mt-2 font-display text-5xl font-semibold sm:text-7xl" aria-live="polite">
                {win?.next ? t(`names.${win.next.name}`) : "…"}
              </p>
              <p className="mt-3 text-sm text-ivory-50/75">
                {timeLabel && (
                  <>
                    {t("at")} <span className="font-semibold text-ivory-50">{timeLabel}</span> ·{" "}
                  </>
                )}
                {t(place.label)}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2 sm:justify-start">
                {place.label === "defaultCity" && (
                  <button
                    type="button"
                    onClick={locate}
                    disabled={locating}
                    className="rounded-full bg-gold-500 px-5 py-2.5 text-sm font-semibold text-green-900 transition hover:brightness-105 disabled:opacity-60"
                  >
                    {t("useLocation")}
                  </button>
                )}
                <Link
                  href="/prayer"
                  className="rounded-full border border-ivory-50/25 px-5 py-2.5 text-sm font-semibold text-ivory-50 transition hover:border-gold-500"
                >
                  {t("link")}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
