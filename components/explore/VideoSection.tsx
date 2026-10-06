import { getLocale, getTranslations } from "next-intl/server";
import { languageLabel, type Video } from "@/lib/explore/videos";
import { InView } from "./InView";
import { SectionHead } from "./SectionHead";
import { VideoGrid } from "./VideoGrid";

/** F3: قسم فيديوهات بعنوانه (قصص المسلمين الجدد، والمحاضرات، والمناظرات)، والتنبيه إن كان محتوى خارجياً. */
export async function VideoSection({ id, ns, videos, note = false }: { id: string; ns: "stories" | "lectures" | "debates"; videos: Video[]; note?: boolean }) {
  if (!videos.length) return null;
  const t = await getTranslations("explore");
  const locale = await getLocale();
  const langNames = Object.fromEntries([...new Set(videos.map((v) => v.lang))].map((l) => [l, languageLabel(l, locale)]));
  return (
    <InView as="section" className="mt-14">
      <div id={id} className="scroll-mt-24">
        <SectionHead kicker={t(`${ns}Kicker`)} title={t(`${ns}Title`)} lead={t(`${ns}Lead`)} />
        {note && (
          <p role="note" className="mt-4 inline-flex items-start gap-2 rounded-2xl border border-gold-500/40 bg-gold-50 px-4 py-2.5 text-sm text-green-900">
            <span aria-hidden>ⓘ</span>
            {t("externalNote")}
          </p>
        )}
        <VideoGrid videos={videos} labels={{ play: t("play"), watchOn: t("watchOn"), lang: t("langLabel") }} langNames={langNames} />
      </div>
    </InView>
  );
}
