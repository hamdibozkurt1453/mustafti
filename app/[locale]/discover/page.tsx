import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { GuidedChat } from "@/components/chat/GuidedChat";
import { DiscoverBooks, DiscoverBooksSkeleton } from "@/components/explore/DiscoverBooks";
import { VideoSection } from "@/components/explore/VideoSection";
import type { Locale } from "@/i18n/locales";
import { DISCOVER_DEBATES, DISCOVER_LECTURES } from "@/lib/explore/videos";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "guided.discover" });
  return { title: t("title"), description: t("lead") };
}

/**
 * `/discover` — محادثة «الداعية» لغير المسلمين (R3): واجهة المحادثة نفسها بوضع discover
 * (احترام بلا ضغط ولا تهجّم، و«بيّنات» أولاً، والإحالة إلى داعية بدور daee).
 * F3: تحت المحادثة «محاضرات تعريفية» و«مناظرات وحوارات» (يوتيوب عند الضغط، بتنبيه المحتوى الخارجي)،
 * و«كتب تجيب عن الأسئلة الكبرى» من IslamHouse (داخل Suspense).
 */
export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout
  return (
    <GuidedChat mode="discover">
      <VideoSection id="lectures" ns="lectures" videos={DISCOVER_LECTURES} />
      <VideoSection id="debates" ns="debates" videos={DISCOVER_DEBATES} note />
      <Suspense fallback={<DiscoverBooksSkeleton />}>
        <DiscoverBooks />
      </Suspense>
    </GuidedChat>
  );
}
