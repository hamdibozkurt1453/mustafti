"use client";

import { useState } from "react";
import { embedUrl, thumbUrl, watchUrl, type Video } from "@/lib/explore/videos";

type Labels = { play: string; watchOn: string; lang: string };

/**
 * F3: شبكة فيديوهات يوتيوب تُحمَّل عند الضغط فقط: صورة مصغرة وزر تشغيل، ثم iframe من
 * youtube-nocookie.com مكان الصورة. لا يُحمَّل أي سكربت من يوتيوب قبل الضغط.
 */
export function VideoGrid({ videos, labels, langNames }: { videos: Video[]; labels: Labels; langNames: Record<string, string> }) {
  return (
    <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {videos.map((v, i) => (
        <VideoCard key={v.id} video={v} labels={labels} langName={langNames[v.lang] ?? v.lang} index={i} />
      ))}
    </ul>
  );
}

function VideoCard({ video, labels, langName, index }: { video: Video; labels: Labels; langName: string; index: number }) {
  const [playing, setPlaying] = useState(false);
  return (
    <li
      className="mf-lift group flex flex-col overflow-hidden rounded-[24px] border border-sand-200 bg-white hover:border-green-600/40"
      style={{ transitionDelay: `${Math.min(index, 6) * 40}ms` }}
    >
      <div className="relative aspect-video bg-green-900">
        {playing ? (
          <iframe
            src={embedUrl(video.id)}
            title={video.title}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button type="button" onClick={() => setPlaying(true)} className="absolute inset-0 h-full w-full" aria-label={`${labels.play}: ${video.title}`}>
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
        )}
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
