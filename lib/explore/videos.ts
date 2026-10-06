import stories from "@/data/new-muslim-stories.json";
import discover from "@/data/discover-videos.json";

/**
 * F3: فيديوهات «قصص من أسلموا حديثاً» (/new-muslim)، و«محاضرات تعريفية» و«مناظرات وحوارات» (/discover).
 * القوائم في data/*.json (لا نستضيف أي فيديو)، والتضمين من youtube-nocookie.com عند الضغط فقط.
 */

export type Video = { id: string; title: string; channel: string; lang: string };

/** معرّف يوتيوب: 11 محرفاً من [A-Za-z0-9_-]. */
export const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** يقبل العناصر الصحيحة فقط (معرّف بالصيغة، وعنوان، ولغة ISO من حرفين). */
export function cleanVideos(raw: unknown): Video[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Video[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const { id, title, channel, lang } = v as Record<string, unknown>;
    if (typeof id !== "string" || !YT_ID_RE.test(id) || seen.has(id)) continue;
    if (typeof title !== "string" || !title.trim() || typeof lang !== "string" || !/^[a-z]{2}$/.test(lang)) continue;
    seen.add(id);
    out.push({ id, title: title.trim(), channel: typeof channel === "string" ? channel.trim() : "", lang });
  }
  return out;
}

export const NEW_MUSLIM_STORIES = cleanVideos(stories.videos);
export const DISCOVER_LECTURES = cleanVideos(discover.lectures);
export const DISCOVER_DEBATES = cleanVideos(discover.debates);

/** رابط التضمين بلا كوكيز تتبع، ويبدأ التشغيل لأن السائل ضغط بنفسه. */
export function embedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`;
}

export function thumbUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export function watchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/** اسم لغة الفيديو بلغة الواجهة («الإنجليزية»، «English»…)، وإلا رمزها. */
export function languageLabel(code: string, uiLocale: string): string {
  try {
    return new Intl.DisplayNames([uiLocale, "en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** F4: احتياط اللغة حين لا يوجد للغة الواجهة فيديوهات. */
export const FALLBACK_VIDEO_LANG = "en";

/**
 * F4: فيديوهات لغة الواجهة فقط (/ar العربية، و/en الإنجليزية). إن لم يوجد للغة فيديوهات فالإنجليزية
 * مع fallback: true (فيظهر سطر «فيديوهات بالإنجليزية»). لا تظهر لغة ثالثة في أي حال.
 */
export function videosFor(videos: Video[], locale: string): { videos: Video[]; fallback: boolean } {
  const own = videos.filter((v) => v.lang === locale);
  if (own.length) return { videos: own, fallback: false };
  return { videos: videos.filter((v) => v.lang === FALLBACK_VIDEO_LANG), fallback: locale !== FALLBACK_VIDEO_LANG };
}

// ---------------------------------------------------------------------------
// F4: فيديو واحد نشط في الصفحة كلها (نافذة واحدة): فتح فيديو يغلق السابق.
// ---------------------------------------------------------------------------

let activeVideo: Video | null = null;
const listeners = new Set<() => void>();

export function openVideo(video: Video | null) {
  activeVideo = video;
  listeners.forEach((l) => l());
}

export function getActiveVideo(): Video | null {
  return activeVideo;
}

export function subscribeVideo(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
