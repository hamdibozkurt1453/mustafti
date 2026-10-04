import { getLocale, getTranslations } from "next-intl/server";
import { chapterAr, languageName, shortDateTime } from "@/lib/experts/format";

/**
 * سطر بيانات الملف عند المختص: «الطلاق والخلع · لغة السائل: العربية · 4 أكتوبر، 3:25 م».
 * كل جزء معزول بـ <bdi>، فلا يقلب اتجاهُ جزءٍ ترتيبَ الأجزاء الأخرى.
 */
export async function CaseMeta({ chapter, lang, createdAt }: { chapter: string | null; lang: string | null; createdAt: string }) {
  const t = await getTranslations("experts.dashboard");
  const locale = await getLocale();
  const parts = [chapterAr(chapter), `${t("langLabel")}: ${languageName(lang, locale)}`, shortDateTime(createdAt, locale)];
  return (
    <span className="text-xs text-ink-600">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && " · "}
          <bdi>{p}</bdi>
        </span>
      ))}
    </span>
  );
}
