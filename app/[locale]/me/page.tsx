import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { CaseFileView, CaseStatusBadge } from "@/components/case/CaseFileView";
import { AnswerCard } from "@/components/experts/AnswerCard";
import { placeholderMetadata } from "@/components/PagePlaceholder";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/locales";
import { signOut } from "@/lib/auth/actions";
import { getAuthContext, roleSatisfies } from "@/lib/auth/roles";
import { chapterName } from "@/lib/case/pillars";
import type { CaseRow, CaseUnknown } from "@/lib/case/types";
import { dirForText } from "@/lib/chat/protocol";
import { answerCards } from "@/lib/experts/store";
import { isAdminClientConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return { ...(await placeholderMetadata(locale, "me")), robots: { index: false } };
}

type MyCase = {
  id: string;
  status: string;
  chapter: string | null;
  created_at: string;
  case_files: {
    summary_ar: string | null;
    summary_user_lang: string | null;
    pillars: { question?: string; rows?: CaseRow[] } | null;
    unknowns: CaseUnknown[] | null;
  }[];
  expert_answers: { answer_ar: string; answer_translated: string | null; expert_id: string }[];
};

/**
 * `/me` — حساب المستخدم المسجّل وملفاته وحالاتها. القراءة بجلسة المستخدم (RLS: صفوفه فقط)،
 * والرمز السري لا يُخزَّن (بصمته فقط)، فالملف يُعرض هنا مباشرة بدل رابط المتابعة.
 */
export default async function MePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout

  const ctx = await getAuthContext();
  if (!roleSatisfies(ctx.role, ["user"])) {
    redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/me`)}`);
  }

  const t = await getTranslations();
  const pages = await getTranslations("pages");
  const tf = await getTranslations("caseFile");
  const format = await getFormatter();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cases")
    .select(
      "id, status, chapter, created_at, case_files(summary_ar, summary_user_lang, pillars, unknowns), expert_answers(answer_ar, answer_translated, expert_id)",
    )
    .eq("owner_id", ctx.userId!)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<MyCase[]>();
  if (error) console.error("me cases:", error.message);
  const cases = data ?? [];
  // بطاقة «أجاب عن مسألتك»: الملفات من جلسة المستخدم (RLS: ملفاته فقط)، وبيانات المختص العامة من الخادم.
  const cards = isAdminClientConfigured() ? await answerCards(cases.flatMap((c) => c.expert_answers.map((a) => a.expert_id))) : new Map();

  return (
    <main className="relative flex-1 px-4 py-10 sm:py-14">
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-56 bg-green-900" />
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <section className="rounded-[var(--radius-mf)] border border-sand-200 bg-ivory-50 p-6 shadow-[0_24px_60px_-30px_rgb(4_48_31/0.45)] sm:p-8">
          <h1 className="font-display text-[28px] font-bold leading-snug text-green-900 sm:text-[32px]">{pages("me.title")}</h1>
          <p className="mt-2 text-ink-600">{pages("me.description")}</p>
          <dl className="mt-6 grid gap-3 text-green-900 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-ink-600">{t("auth.signedInAs")}</dt>
              <dd className="font-semibold" dir="ltr">
                {ctx.email}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-ink-600">{t("auth.roleLabel")}</dt>
              <dd className="font-semibold">{t(`auth.roles.${ctx.role}`)}</dd>
            </div>
          </dl>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {ctx.expertStatus ? (
              <Link href="/expert" className="rounded-full bg-gold-500 px-5 py-2.5 font-semibold text-green-900">
                {t("experts.dashboardLink")}
              </Link>
            ) : (
              <Link href="/experts/join" className="font-semibold text-green-600 underline underline-offset-4">
                {t("experts.joinLink")}
              </Link>
            )}
            <form action={signOut}>
              <input type="hidden" name="locale" value={locale} />
              <button
                type="submit"
                className="rounded-full border border-green-900/20 px-5 py-2.5 font-semibold text-green-900 transition hover:bg-green-900/5"
              >
                {t("auth.signOut")}
              </button>
            </form>
          </div>
        </section>

        <section className="rounded-[var(--radius-mf)] border border-sand-200 bg-white p-6 sm:p-8">
          <h2 className="text-xl font-bold text-green-900">{tf("meTitle")}</h2>
          <p className="mt-1 text-sm text-ink-600">{tf("meHint")}</p>
          {cases.length === 0 ? (
            <p className="mt-6 rounded-xl border border-dashed border-sand-200 bg-ivory-50 p-4 text-center text-sm text-ink-600">
              {tf("meEmpty")}
            </p>
          ) : (
            <ul className="mt-6 space-y-3">
              {cases.map((c) => {
                const file = c.case_files[0];
                const summary = file?.summary_user_lang || file?.summary_ar || "";
                return (
                  <li key={c.id} className="rounded-2xl border border-sand-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CaseStatusBadge status={c.status} />
                      <span className="text-xs text-ink-600">
                        {chapterName(c.chapter, locale === "ar" ? "ar" : "en")} ·{" "}
                        {format.dateTime(new Date(c.created_at), { dateStyle: "medium" })}
                      </span>
                    </div>
                    <p dir={dirForText(summary)} className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-green-900">
                      {summary}
                    </p>
                    {c.expert_answers.map((a, i) => (
                      <div key={i} className="mt-3 space-y-2 rounded-xl bg-ivory-50 p-3 text-sm">
                        <p className="text-[11px] font-semibold text-green-600">{tf("answerTitle")}</p>
                        <p dir="rtl" lang="ar" className="whitespace-pre-wrap">
                          {a.answer_ar}
                        </p>
                        {a.answer_translated && (
                          <div className="border-t border-sand-200 pt-2">
                            <p className="mb-1 text-[11px] font-semibold text-green-600">{tf("answerTranslated")}</p>
                            <p dir={dirForText(a.answer_translated)} className="whitespace-pre-wrap">
                              {a.answer_translated}
                            </p>
                          </div>
                        )}
                        {cards.get(a.expert_id) && <AnswerCard card={cards.get(a.expert_id)!} />}
                      </div>
                    ))}
                    {file && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm font-semibold text-green-600">{tf("showFile")}</summary>
                        <div className="mt-3">
                          <CaseFileView
                            locale={locale}
                            chapter={c.chapter}
                            question={file.pillars?.question ?? ""}
                            summaryAr={file.summary_ar ?? ""}
                            summaryUser={file.summary_user_lang ?? ""}
                            rows={file.pillars?.rows ?? []}
                            unknowns={file.unknowns ?? []}
                          />
                        </div>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
