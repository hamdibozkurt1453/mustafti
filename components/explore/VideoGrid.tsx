"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "@/components/icons";
import { embedUrl, getActiveVideo, openVideo, subscribeVideo, thumbUrl, watchUrl, type Video } from "@/lib/explore/videos";

type Labels = { play: string; watchOn: string; lang: string; close: string };

const useActiveVideo = () => useSyncExternalStore(subscribeVideo, getActiveVideo, () => null);

/**
 * F3: شبكة فيديوهات يوتيوب، لا يُحمَّل أي سكربت من يوتيوب قبل الضغط.
 * F4: الضغط يفتح الفيديو في نافذة كبيرة داخل المنصة (حتى 960px بنسبة 16:9، خلفية داكنة) ويبدأ التشغيل
 * تلقائياً. فيديو واحد في الصفحة كلها (openVideo في lib/explore/videos.ts): فتح فيديو يغلق السابق.
 * الإغلاق بالزر، وبـ Esc، وبالضغط خارج الفيديو.
 */
export function VideoGrid({ videos, labels, langNames }: { videos: Video[]; labels: Labels; langNames: Record<string, string> }) {
  const active = useActiveVideo();
  const mine = active && videos.some((v) => v.id === active.id) ? active : null;
  // مغادرة الصفحة تغلق فيديوها.
  useEffect(
    () => () => {
      const current = getActiveVideo();
      if (current && videos.some((v) => v.id === current.id)) openVideo(null);
    },
    [videos],
  );
  return (
    <>
      <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {videos.map((v, i) => (
          <VideoCard key={v.id} video={v} labels={labels} langName={langNames[v.lang] ?? v.lang} index={i} />
        ))}
      </ul>
      {mine && <VideoModal video={mine} labels={labels} />}
    </>
  );
}

function VideoCard({ video, labels, langName, index }: { video: Video; labels: Labels; langName: string; index: number }) {
  return (
    <li
      className="mf-lift group flex flex-col overflow-hidden rounded-[24px] border border-sand-200 bg-white hover:border-green-600/40"
      style={{ transitionDelay: `${Math.min(index, 6) * 40}ms` }}
    >
      <div className="relative aspect-video bg-green-900">
        <button
          type="button"
          onClick={() => openVideo(video)}
          className="absolute inset-0 h-full w-full"
          aria-haspopup="dialog"
          aria-label={`${labels.play}: ${video.title}`}
          data-video-id={video.id}
        >
          {/* الصورة المصغرة من خادم صور يوتيوب (نطاق خارجي)، فلا next/image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbUrl(video.id)} alt="" loading="lazy" className="h-full w-full object-cover opacity-90 transition duration-500 group-hover:scale-[1.03] group-hover:opacity-100" />
          <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-green-900/70 via-green-900/10 to-transparent" />
          <span
            aria-hidden
            className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-gold-500 text-green-900 shadow-lg ring-8 ring-gold-500/25 transition group-hover:scale-110"
          >
            <svg viewBox="0 0 24 24" className="ms-0.5 h-6 w-6" fill="currentColor">
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          </span>
          <span className="absolute bottom-3 start-3 rounded-full bg-ivory-50/95 px-2.5 py-0.5 text-[11px] font-semibold text-green-900">
            {labels.lang}: {langName}
          </span>
        </button>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 dir="auto" className="line-clamp-2 font-semibold leading-snug text-green-900">
          {video.title}
        </h3>
        <p className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-ink-600">
          <span dir="auto">{video.channel}</span>
          <a href={watchUrl(video.id)} target="_blank" rel="noopener noreferrer" className="font-semibold text-green-600 underline-offset-4 hover:underline">
            {labels.watchOn} ↗
          </a>
        </p>
      </div>
    </li>
  );
}

/** النافذة: خلفية داكنة، والفيديو حتى 960px بنسبة 16:9، وزر إغلاق، وEsc، والضغط خارجها. */
function VideoModal({ video, labels }: { video: Video; labels: Labels }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && openVideo(null);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [video.id]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={video.title}
      data-testid="video-modal"
      onClick={(e) => e.target === e.currentTarget && openVideo(null)}
      className="mf-fade fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-[960px]">
        <div className="mb-3 flex items-start justify-between gap-3 text-ivory-50">
          <p dir="auto" className="line-clamp-2 min-w-0 font-semibold leading-snug">
            {video.title}
          </p>
          <button
            ref={closeRef}
            type="button"
            onClick={() => openVideo(null)}
            aria-label={labels.close}
            className="flex-none rounded-full bg-ivory-50/10 p-2 text-ivory-50 transition hover:bg-ivory-50/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-500"
          >
            <CloseIcon className="size-6" />
          </button>
        </div>
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-2xl">
          <iframe
            key={video.id}
            src={embedUrl(video.id)}
            title={video.title}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
        <p className="mt-3 text-end text-xs">
          <a href={watchUrl(video.id)} target="_blank" rel="noopener noreferrer" className="font-semibold text-ivory-50/80 underline-offset-4 hover:text-gold-500 hover:underline">
            {labels.watchOn} ↗
          </a>
        </p>
      </div>
    </div>,
    document.body,
  );
}
