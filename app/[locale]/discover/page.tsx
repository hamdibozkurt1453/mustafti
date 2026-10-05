import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { GuidedChat } from "@/components/chat/GuidedChat";
import type { Locale } from "@/i18n/locales";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "guided.discover" });
  return { title: t("title"), description: t("lead") };
}

/**
 * `/discover` — محادثة «الداعية» لغير المسلمين (R3): واجهة المحادثة نفسها بوضع discover
 * (احترام بلا ضغط ولا تهجّم، و«بيّنات» أولاً، والإحالة إلى داعية بدور daee).
 */
export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout
  return <GuidedChat mode="discover" />;
}
