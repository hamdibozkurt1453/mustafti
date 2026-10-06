import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { ForumAuthor } from "@/lib/forum/store";
import { ExpertAvatar } from "@/components/experts/ExpertAvatar";

/**
 * قطع صغيرة مشتركة في «الحوار» (R4): اسم الكاتب وشارة «مختص موثّق»، وتنبيه «ليس فتوى»، ونص المشاركة.
 */

/** الكاتب: اسمه المعروض (أو «مشارك»)، وللمختص المقبول شارة دوره ورابط ملفه العام. */
export async function AuthorLine({ author, size = 32 }: { author: ForumAuthor; size?: number }) {
  const t = await getTranslations("forum");
  const name = author.name || t("anonymous");
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
      <ExpertAvatar url={author.avatarUrl ?? author.expert?.avatarUrl ?? null} name={name} size={size} />
      <bdi className="truncate font-semibold text-green-900">{name}</bdi>
      {author.expert && (
        <>
          <span className="inline-flex items-center gap-1 rounded-full bg-green-600 px-2.5 py-0.5 text-[11px] font-semibold text-ivory-50">
            <span aria-hidden>✓</span>
            {t("thread.expertBadge")} · {t(`thread.expertRoles.${author.expert.role}`)}
          </span>
          <Link
            href={`/experts/${author.expert.slug}`}
            className="text-xs font-semibold text-green-600 underline underline-offset-4 hover:text-green-900"
          >
            {t("thread.viewProfile")}
          </Link>
        </>
      )}
    </span>
  );
}

/** تنبيه ظاهر على حكم شرعي جازم من غير مختص، مع رابط إلى المحادثة. */
export async function RulingNotice() {
  const t = await getTranslations("forum.thread");
  return (
    <p role="note" className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-gold-500/60 bg-gold-50 px-3 py-2 text-sm font-semibold text-green-900">
      <span aria-hidden>⚠</span>
      <span>{t("rulingNotice")}</span>
      <Link href="/" className="text-green-600 underline underline-offset-4 hover:text-green-900">
        {t("askLink")}
      </Link>
    </p>
  );
}

/** نص المشاركة كما كتبه صاحبه: نص خام بلا HTML، والأسطر محفوظة، والاتجاه تلقائي. */
export function PostBody({ text }: { text: string }) {
  return (
    <div dir="auto" className="whitespace-pre-line break-words leading-relaxed text-green-900">
      {text}
    </div>
  );
}
