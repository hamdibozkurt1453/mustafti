import { getFormatter, getTranslations } from "next-intl/server";
import { CaseFileView, CaseStatusBadge } from "@/components/case/CaseFileView";
import { AnswerCard } from "@/components/experts/AnswerCard";
import { chapterName } from "@/lib/case/pillars";
import type { CaseRow, CaseUnknown } from "@/lib/case/types";
import { dirForText } from "@/lib/chat/protocol";
import { answerCards } from "@/lib/experts/store";
import { isAdminClientConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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
  expert_answers: { answer_ar: string; answer_translated: string | null; expert_id: string | null }[];
};

/**
 * تبويب «مسائلي» في /me: ملفات المستخدم وحالاتها وأجوبتها. القراءة بجلسته (RLS: صفوفه فقط)،
 * والرمز السري لا يُخزَّن (بصمته فقط)، فالملف يُعرض هنا مباشرة بدل رابط المتابعة.
 */
export async function MyCases({ userId, locale }: { userId: string; locale: string }) {
  const tf = await getTranslations("caseFile");
  const format = await getFormatter();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cases")
    .select(
      "id, status, chapter, created_at, case_files(summary_ar, summary_user_lang, pillars, unknowns), expert_answers(answer_ar, answer_translated, expert_id)",
    )
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<MyCase[]>();
  if (error) console.error("me cases:", error.message);
  const cases = data ?? [];
  // بطاقة «أجاب عن مسألتك»: الملفات من جلسة المستخدم (RLS: ملفاته فقط)، وبيانات المختص العامة من الخادم.
  const cards = isAdminClientConfigured()
    ? await answerCards(cases.flatMap((c) => c.expert_answers.map((a) => a.expert_id ?? "")))
    : new Map();

  return (
    <section>
      <p className="text-sm text-ink-600">{tf("meHint")}</p>
      {cases.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-sand-200 bg-ivory-50 p-4 text-center text-sm text-ink-600">
          {tf("meEmpty")}
        </p>
      ) : (
        <ul className="mf-stagger mt-6 space-y-3">
          {cases.map((c) => {
            const file = c.case_files[0];
            const summary = file?.summary_user_lang || file?.summary_ar || "";
            return (
              <li key={c.id} className="mf-lift rounded-2xl border border-sand-200 bg-white p-4">
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
                    {a.expert_id && cards.get(a.expert_id) && <AnswerCard card={cards.get(a.expert_id)!} />}
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
  );
}
