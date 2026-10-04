import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CaseStatusBadge } from "@/components/case/CaseFileView";
import { CaseMeta } from "@/components/experts/CaseMeta";
import { ExpertGate } from "@/components/experts/ExpertGate";
import { placeholderMetadata } from "@/components/PagePlaceholder";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/locales";
import { AuthzError, getAuthContext } from "@/lib/auth/roles";
import { CHAPTERS } from "@/lib/brain/prompts";
import { chapterOptionsAr } from "@/lib/experts/format";
import { expertQueue, requireApprovedExpert, type ExpertSelf } from "@/lib/experts/store";
import { CASE_STATUSES } from "@/lib/experts/types";
import { isAdminClientConfigured } from "@/lib/supabase/admin";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ chapter?: string; status?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return { ...(await placeholderMetadata(locale, "expert")), robots: { index: false, follow: false } };
}

/**
 * `/expert` — لوحة المختص المقبول (S9). الفحص في الخادم لكل طلب (status = approved من القاعدة).
 * الملفات: المحالة إلى دوره وتنتظر، أو المسندة إليه؛ الأولوية العالية ثم الأقدم، وتصفية بالباب والحالة.
 * لا هوية للسائل في أي عمود يُقرأ هنا.
 */
export default async function ExpertPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout

  const ctx = await getAuthContext();
  if (!ctx.userId) redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/expert`)}`);
  if (!isAdminClientConfigured()) return <ExpertGate status={null} />;

  let self: ExpertSelf;
  try {
    self = await requireApprovedExpert();
  } catch (error) {
    if (error instanceof AuthzError) return <ExpertGate status={ctx.expertStatus} />;
    throw error;
  }

  const sp = await searchParams;
  const chapter = (CHAPTERS as readonly string[]).includes(sp.chapter ?? "") ? sp.chapter : undefined;
  const status = (CASE_STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status : undefined;
  const cases = await expertQueue(self, { chapter, status });

  const t = await getTranslations("experts.dashboard");
  const tj = await getTranslations("experts.join");
  const tf = await getTranslations("caseFile");
  const pages = await getTranslations("pages");

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:py-14">
      <h1 className="text-[28px] font-bold leading-snug sm:text-[36px]">{pages("expert.title")}</h1>
      <p className="mt-2 text-ink-600">
        {pages("expert.description")} · <span className="font-semibold text-green-900">{tj(`roles.${self.role}`)}</span>
      </p>

      <form className="mt-6 flex flex-wrap items-end gap-3 rounded-[22px] border border-sand-200 bg-white p-4" method="get">
        <label className="space-y-1 text-sm">
          <span className="block font-semibold text-green-900">{t("filterChapter")}</span>
          <select name="chapter" defaultValue={chapter ?? ""} className="rounded-xl border border-sand-200 bg-white px-3 py-2">
            <option value="">{t("all")}</option>
            {chapterOptionsAr().map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block font-semibold text-green-900">{t("filterStatus")}</span>
          <select name="status" defaultValue={status ?? ""} className="rounded-xl border border-sand-200 bg-white px-3 py-2">
            <option value="">{t("all")}</option>
            {CASE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {tf(`statuses.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-full bg-green-900 px-5 py-2 text-sm font-semibold text-ivory-50">
          {t("apply")}
        </button>
      </form>

      {cases.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-sand-200 bg-ivory-50 p-4 text-center text-sm text-ink-600">{t("empty")}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {cases.map((c) => (
            <li key={c.id} className="rounded-2xl border border-sand-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <CaseStatusBadge status={c.status} />
                {c.priority === "high" && (
                  <span className="rounded-full bg-alert-600 px-3 py-1 text-xs font-semibold text-ivory-50">{t("high")}</span>
                )}
                {c.mine && <span className="rounded-full border border-green-600 px-3 py-1 text-xs font-semibold text-green-600">{t("mine")}</span>}
                <span className="ms-auto">
                  <CaseMeta chapter={c.chapter} lang={c.lang} createdAt={c.created_at} />
                </span>
              </div>
              <p dir="rtl" lang="ar" className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-green-900">
                {c.summary}
              </p>
              <Link href={`/expert/case/${c.id}`} className="mt-2 inline-block text-sm font-semibold text-green-600 underline underline-offset-4">
                {t("open")}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
