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
