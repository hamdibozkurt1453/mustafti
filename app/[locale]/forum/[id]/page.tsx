import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthorLine, PostBody, RulingNotice } from "@/components/forum/ForumBits";
import { ExpertAnswerToggle, ReplyForm, ReportButton } from "@/components/forum/ForumForms";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/locales";
import { getAuthContext } from "@/lib/auth/roles";
import { shortDateTime } from "@/lib/experts/format";
import { acceptsReplies, askHref, canMarkExpertAnswer, isVerifiedExpert } from "@/lib/forum/rules";
import { getThread } from "@/lib/forum/store";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const data = await getThread(id);
  if (!data) return { robots: { index: false } };
  const t = await getTranslations({ locale: locale as Locale, namespace: "forum" });
  return { title: `${data.thread.title} — ${t("title")}`, description: data.thread.body.slice(0, 200) };
}

/**
 * `/forum/[id]` — الموضوع وردوده (R4).
 * رد المختص المقبول بشارة «مختص موثّق» (مفتٍ / داعية / مرشد) ورابط ملفه العام، و«جواب مختص» يظهر أولاً.
 * زر «إبلاغ» على الموضوع وكل رد، وزر «اسأل مُستفتي عن هذا» ينقل العنوان إلى المحادثة (?q=).
 * لا جواب مولّد آلياً في الحوار أبداً.
 */
export default async function ThreadPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout
  const [ctx, data] = await Promise.all([getAuthContext(), getThread(id)]);
  if (!data) notFound();
  const { thread, posts } = data;
  const t = await getTranslations("forum");

  const signedIn = Boolean(ctx.userId);
  const here = `/${locale}/forum/${thread.id}`;
  const loginHref = `/${locale}/login?next=${encodeURIComponent(here)}`;
  const open = acceptsReplies(thread.status);

  return (
    <main className="relative flex-1 px-4 pb-14 pt-8 sm:pt-12">
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-64 bg-green-900" />
      <div className="mx-auto w-full max-w-3xl">
        <Link href="/forum" className="inline-flex items-center gap-2 text-sm font-semibold text-ivory-50/80 hover:text-gold-500">
          <span aria-hidden className="ltr:-scale-x-100">→</span>
          {t("thread.back")}
        </Link>

        {/* الموضوع */}
        <article className="mf-stagger mt-4 rounded-[28px] border border-sand-200 bg-ivory-50 p-6 shadow-[0_24px_60px_-30px_rgb(4_48_31/0.45)] sm:p-8">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
            {thread.pinned && <span className="rounded-full bg-gold-500 px-2.5 py-1 text-green-900">📌 {t("pinned")}</span>}
            {thread.status === "locked" && <span className="rounded-full bg-green-900 px-2.5 py-1 text-ivory-50">🔒 {t("locked")}</span>}
            <Link href={{ pathname: "/forum", query: { cat: thread.category } }} className="rounded-full bg-green-900/[0.06] px-2.5 py-1 text-green-600 hover:bg-green-900/10">
              {t(`categories.${thread.category}`)}
            </Link>
          </div>
          <h1 dir="auto" className="mt-3 font-display text-[26px] font-semibold leading-snug text-green-900 sm:text-[32px]">
            {thread.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-600">
            <AuthorLine author={thread.author} />
            <time dateTime={thread.createdAt} className="tabular-nums">
              {shortDateTime(thread.createdAt, locale)}
            </time>
          </div>
          <div className="mt-5">
            <PostBody text={thread.body} />
          </div>
          {thread.rulingNotice && <RulingNotice />}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-sand-200 pt-4">
            <Link
              href={askHref(thread.title)}
              className="mf-press inline-flex items-center gap-2 rounded-full bg-gold-500 px-5 py-2.5 text-sm font-semibold text-green-900 hover:brightness-105"
            >
              {t("thread.askMustafti")}
              <span aria-hidden className="rtl:-scale-x-100">→</span>
            </Link>
            <ReportButton targetType="thread" targetId={thread.id} signedIn={signedIn} loginHref={loginHref} />
          </div>
        </article>

        {/* الردود */}
        <section aria-labelledby="replies-title" className="mt-8">
          <h2 id="replies-title" className="text-lg font-bold text-green-900">
            {t("thread.repliesTitle")} <span className="tabular-nums text-ink-600">({posts.length})</span>
          </h2>
          {posts.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-sand-200 bg-white p-6 text-center text-ink-600">{t("thread.noReplies")}</p>
          ) : (
            <ol className="mt-3 space-y-3">
              {posts.map((p) => (
                <li key={p.id} id={`post-${p.id}`}>
                  <article className={`rounded-[22px] border bg-white p-5 ${p.featured ? "border-green-600 ring-2 ring-green-600/20" : "border-sand-200"}`}>
                    {p.featured && (
                      <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-green-900 px-3 py-1 text-xs font-semibold text-gold-500">
                        <span aria-hidden>★</span>
                        {t("thread.expertAnswer")}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-600">
                      <AuthorLine author={p.author} size={28} />
                      <time dateTime={p.createdAt} className="tabular-nums">
                        {shortDateTime(p.createdAt, locale)}
                      </time>
                    </div>
                    <div className="mt-3">
                      <PostBody text={p.body} />
                    </div>
                    {p.rulingNotice && <RulingNotice />}
                    <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                      {canMarkExpertAnswer(ctx, p.author.id) && <ExpertAnswerToggle postId={p.id} marked={p.isExpertAnswer} />}
                      <ReportButton targetType="post" targetId={p.id} signedIn={signedIn} loginHref={loginHref} />
                    </div>
                  </article>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* الرد */}
        <section className="mt-8 rounded-[24px] border border-sand-200 bg-ivory-50 p-6 sm:p-8">
          <h2 className="mb-4 text-lg font-bold text-green-900">{t("thread.replyTitle")}</h2>
          {!open ? (
            <p className="rounded-xl bg-green-900/[0.06] px-4 py-3 text-sm font-semibold text-green-900">🔒 {t("thread.lockedNote")}</p>
          ) : signedIn ? (
            <ReplyForm threadId={thread.id} expert={isVerifiedExpert(ctx.expertStatus)} />
          ) : (
            <a href={loginHref} className="mf-press inline-flex rounded-full bg-green-900 px-6 py-3 font-semibold text-ivory-50 hover:bg-green-600">
              {t("thread.loginToReply")}
            </a>
          )}
          <p className="mt-5 text-xs text-ink-600">
            <strong className="text-green-900">{t("rulesTitle")}: </strong>
            {t("rules")}
          </p>
        </section>
      </div>
    </main>
  );
}
