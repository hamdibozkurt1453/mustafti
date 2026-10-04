import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AnswerCard as Card } from "@/lib/experts/store";
import { ExpertAvatar } from "./ExpertAvatar";

/** «أجاب عن مسألتك»: الصورة، والاسم، والتخصص، ورابط الملف العام. (السائل يرى المختص، لا العكس.) */
export async function AnswerCard({ card }: { card: Card }) {
  const t = await getTranslations("experts.profile");
  return (
    <div className="flex items-center gap-3 rounded-xl border border-sand-200 bg-white p-3">
      <ExpertAvatar url={card.avatarUrl} name={card.name} size={48} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-green-600">{t("answeredBy")}</p>
        <p dir="auto" className="truncate font-semibold text-green-900">
          {card.name}
        </p>
        {card.specialty && (
          <p dir="auto" className="truncate text-xs text-ink-600">
            {card.specialty}
          </p>
        )}
      </div>
      <Link href={`/experts/${card.slug}`} className="shrink-0 text-sm font-semibold text-green-600 underline underline-offset-4">
        {t("viewProfile")}
      </Link>
    </div>
  );
}
