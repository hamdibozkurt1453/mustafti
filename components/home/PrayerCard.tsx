"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { cityById } from "@/lib/prayer/cities";
import {
  DEFAULT_SETTINGS,
  formatCountdown,
  loadSettings,
  prayerWindow,
  resolvePlace,
  storeSettings,
  type PrayerSettings,
} from "@/lib/prayer/times";

/** بطاقة الصلاة القادمة: عدّ تنازلي حي وقوس يتقدم من الصلاة السابقة إلى القادمة. */
export function PrayerCard() {
  const t = useTranslations("home.nextPrayer");
  const locale = useLocale();
  const [now, setNow] = useState<Date | null>(null);
  // الاختيار نفسه المحفوظ في /prayer (المتصفح فقط)، وإلا مكة بتقويم أم القرى.
  const [settings, setSettings] = useState<PrayerSettings>(DEFAULT_SETTINGS);
  const [custom, setCustom] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    // الوقت والاختيار يُقرآن في المتصفح فقط، حتى لا يختلفا عن HTML المولّد في الخادم.
    const tick = () => setNow(new Date());
    const stored = loadSettings();
    const first = setTimeout(() => {
      if (stored) {
        setSettings(stored);
        setCustom(true);
      }
      tick();
    }, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  // نعيد الحساب كل دقيقة فقط، لا كل ثانية.
  const minuteKey = now ? Math.floor(now.getTime() / 60000) : 0;
  const win = useMemo(
    () => (minuteKey ? prayerWindow(settings, new Date(minuteKey * 60000 + 59999)) : null),
    [settings, minuteKey],
  );

  function locate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // يبقى في المتصفح فقط (لا يُرسل إلى الخادم)، ويظهر في /prayer أيضاً.
        const round = (n: number) => Math.round(n * 100) / 100;
        const next: PrayerSettings = {
          ...settings,
          place: { kind: "geo", lat: round(pos.coords.latitude), lng: round(pos.coords.longitude) },
        };
        setSettings(next);
        storeSettings(next);
        setCustom(true);
        setLocating(false);
      },
      () => setLocating(false),
      { maximumAge: 3600_000, timeout: 10_000 },
    );
  }

  const city = settings.place.kind === "city" ? cityById(settings.place.cityId) : undefined;
  const placeLabel = city ? (locale === "ar" ? city.ar : city.en) : t("yourLocation");

  const R = 54;
  let progress = 0;
  let remaining = "--:--:--";
  let timeLabel = "";
  if (now && win?.next && win.prev) {
    const total = win.next.at.getTime() - win.prev.at.getTime();
    const left = Math.max(0, win.next.at.getTime() - now.getTime());
    progress = Math.min(1, Math.max(0, 1 - left / total));
    remaining = formatCountdown(left);
    timeLabel = new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: resolvePlace(settings.place).tz,
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
                {placeLabel}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2 sm:justify-start">
                {!custom && (
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
