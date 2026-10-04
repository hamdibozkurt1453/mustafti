import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { CaseStatusBadge } from "@/components/case/CaseFileView";
import { AnswerForm, ClaimButton, MissingForm } from "@/components/experts/ExpertCaseActions";
import { ExpertGate } from "@/components/experts/ExpertGate";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/locales";
import { AuthzError, getAuthContext } from "@/lib/auth/roles";
import { chapterName } from "@/lib/case/pillars";
import { dirForText } from "@/lib/chat/protocol";
import { expertCase, requireApprovedExpert, type ExpertSelf } from "@/lib/experts/store";
import { isAdminClientConfigured } from "@/lib/supabase/admin";

type Props = { params: Promise<{ locale: string; id: string }> };

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

// الاعتماد يشمل الترجمة الآلية (مهلة 25 ثانية وإعادة، ثم النموذج الاحتياطي)، مثل مهلة مسار الاستيضاح.
export const maxDuration = 120;

/**
 * `/expert/case/[id]` — ملف واحد للمختص المقبول: الملخص بالعربية، والأركان، و«ما لم يُعرف»،
 * ثم «أتولّى هذا الملف» أو خانة الجواب و«اعتماد وإرسال»، و«ينقص هذا السؤال».
 * لا يظهر للمختص ما يدل على السائل (لا بريد ولا حساب ولا المحادثة الخام).
 */
export default async function ExpertCasePage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout

  const ctx = await getAuthContext();
  if (!ctx.userId) redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/expert/case/${id}`)}`);
  if (!isAdminClientConfigured()) notFound();

  let self: ExpertSelf;
  try {
    self = await requireApprovedExpert();
  } catch (error) {
    if (error instanceof AuthzError) return <ExpertGate status={ctx.expertStatus} />;
    throw error;
  }

  const c = await expertCase(self, id);
  if (!c) notFound();

  const t = await getTranslations("experts.dashboard");
  const format = await getFormatter();
  const canAnswer = c.mine && c.status === "assigned";

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
      <Link href="/expert" className="text-sm font-semibold text-green-600 underline underline-offset-4">
        {t("backToList")}
      </Link>

      <section className="mt-4 rounded-[22px] border border-sand-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <CaseStatusBadge status={c.status} />
          {c.priority === "high" && <span className="rounded-full bg-alert-600 px-3 py-1 text-xs font-semibold text-ivory-50">{t("high")}</span>}
          <span className="ms-auto text-xs text-ink-600">
            {chapterName(c.chapter, "ar")} · {t("langLabel")}: {c.lang ?? "ar"} ·{" "}
            {format.dateTime(new Date(c.createdAt), { dateStyle: "medium", timeStyle: "short" })}
          </span>
        </div>

        <div dir="rtl" lang="ar" className="mt-5 space-y-5">
          <section>
            <h2 className="mb-1 text-xs font-semibold text-green-600">{t("summary")}</h2>
            <p className="whitespace-pre-wrap leading-relaxed text-green-900">{c.summaryAr}</p>
          </section>

          {c.rows.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold text-green-600">{t("pillars")}</h2>
              <table className="w-full overflow-hidden rounded-xl border border-sand-200 text-sm">
                <tbody className="divide-y divide-sand-200">
                  {c.rows.map((r) => (
                    <tr key={r.key}>
                      <th scope="row" className="w-1/2 bg-ivory-50 px-3 py-2 text-start font-normal text-ink-600">
                        {r.labelAr || r.label}
                        {r.generated ? <span className="ms-1 text-[11px] text-green-600">(مولّد)</span> : null}
                      </th>
                      <td className="px-3 py-2 font-semibold text-green-900">{r.valueAr || r.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section>
            <h2 className="mb-1 text-xs font-semibold text-green-600">{t("unknowns")}</h2>
            {c.unknowns.length ? (
              <ul className="list-inside list-disc space-y-0.5 text-sm text-ink-600">
                {c.unknowns.map((u) => (
                  <li key={u.key}>{u.labelAr || u.label}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-600">{t("noUnknowns")}</p>
            )}
          </section>

          {c.question && (
            <details className="rounded-xl bg-ivory-50 px-3 py-2 text-sm">
              <summary className="cursor-pointer text-xs font-semibold text-green-600">{t("question")}</summary>
              <p dir={dirForText(c.question)} className="mt-2 whitespace-pre-wrap leading-relaxed">
                {c.question}
              </p>
            </details>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-[22px] border border-sand-200 bg-white p-5">
        {!c.mine && c.status === "submitted" && <ClaimButton caseId={c.id} />}
        {canAnswer && <AnswerForm caseId={c.id} />}
        {c.answer && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold">{t("yourAnswer")}</h2>
            <p dir="rtl" lang="ar" className="whitespace-pre-wrap leading-relaxed">
              {c.answer.answerAr}
            </p>
            {c.answer.answerTranslated && (
              <div className="rounded-xl bg-ivory-50 p-3">
                <p className="mb-1 text-[11px] font-semibold text-green-600">{t("translation")}</p>
                <p dir={dirForText(c.answer.answerTranslated)} className="whitespace-pre-wrap text-sm leading-relaxed">
                  {c.answer.answerTranslated}
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-[22px] border border-sand-200 bg-white p-5">
        <MissingForm caseId={c.id} />
        {c.missing.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-green-600">{t("missingPrev")}</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-ink-600">
              {c.missing.map((m, i) => (
                <li key={i} dir={dirForText(m.note)}>
                  {m.note}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
