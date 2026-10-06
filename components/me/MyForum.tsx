import "server-only";

import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { shortDateTime } from "@/lib/experts/format";
import { myForumActivity } from "@/lib/forum/store";

/** «مشاركاتي في الحوار» في /me (R4): مواضيع الحساب وردوده الظاهرة، بجلسته (RLS). */
export async function MyForum({ userId }: { userId: string }) {
  const t = await getTranslations("me.forum");
  const tf = await getTranslations("forum");
  const locale = await getLocale();
  const { threads, posts } = await myForumActivity(userId);

  if (!threads.length && !posts.length) {
    return (
      <div className="text-center">
        <p className="font-display text-2xl font-semibold text-green-900">{t("title")}</p>
        <p className="mx-auto mt-2 max-w-md text-ink-600">{t("empty")}</p>
        <Link href="/forum" className="mf-press mt-6 inline-block rounded-full bg-green-900 px-5 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-green-600">
          {t("cta")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {threads.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-green-900">{t("threadsTitle")}</h2>
          <ul className="mt-3 divide-y divide-sand-200 rounded-xl border border-sand-200">
            {threads.map((th) => (
              <li key={th.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <Link href={`/forum/${th.id}`} dir="auto" className="min-w-0 truncate font-semibold text-green-900 hover:text-green-600">
                  {th.title}
                </Link>
                <span className="text-xs tabular-nums text-ink-600">
                  {tf("replies", { count: th.repliesCount })} · {shortDateTime(th.lastActivityAt, locale)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {posts.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-green-900">{t("postsTitle")}</h2>
          <ul className="mt-3 divide-y divide-sand-200 rounded-xl border border-sand-200">
            {posts.map((p) => (
              <li key={p.id} className="p-3">
                <Link href={`/forum/${p.threadId}#post-${p.id}`} dir="auto" className="font-semibold text-green-900 hover:text-green-600">
                  {t("replyIn", { title: p.threadTitle })}
                </Link>
                <p dir="auto" className="mt-1 line-clamp-2 text-sm text-ink-600">
                  {p.body}
                </p>
                <p className="mt-1 text-xs tabular-nums text-ink-600">{shortDateTime(p.createdAt, locale)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
