import { getTranslations } from "next-intl/server";
import { chapterName } from "@/lib/case/pillars";
import type { CaseRow, CaseUnknown } from "@/lib/case/types";
import { dirForText } from "@/lib/chat/protocol";

/** حالة الملف بشارة ملوّنة. */
export async function CaseStatusBadge({ status }: { status: string }) {
  const t = await getTranslations("caseFile");
  const tone =
    status === "answered"
      ? "bg-green-600 text-ivory-50"
      : status === "closed"
        ? "bg-sand-200 text-green-900"
        : "bg-gold-500 text-green-900";
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>{t(`statuses.${status}` as "statuses.submitted")}</span>;
}

type FileProps = {
  locale: string;
  chapter: string | null;
  question: string;
  summaryAr: string;
  summaryUser: string;
  rows: CaseRow[];
  unknowns: CaseUnknown[];
};

/** ملف المسألة كما أرسله السائل (بلا هوية): السؤال، والملخص، وجدول الأركان، و«ما لم يُعرف». */
export async function CaseFileView({ locale, chapter, question, summaryAr, summaryUser, rows, unknowns }: FileProps) {
  const t = await getTranslations("case");
  const tf = await getTranslations("caseFile");
  const arabic = locale === "ar";
  return (
    <div className="space-y-5">
      {chapter && (
        <p className="text-sm text-ink-600">
          {tf("chapter")}: <span className="font-semibold text-green-900">{chapterName(chapter, arabic ? "ar" : "en")}</span>
        </p>
      )}
      {question && (
        <section>
          <h3 className="mb-1 text-xs font-semibold text-green-600">{t("question")}</h3>
          <p dir={dirForText(question)} className="whitespace-pre-wrap rounded-xl bg-ivory-50 px-3 py-2 leading-relaxed">
            {question}
          </p>
        </section>
      )}
      <section>
        <h3 className="mb-1 text-xs font-semibold text-green-600">{t("summary")}</h3>
        <p dir={dirForText(summaryUser)} className="whitespace-pre-wrap leading-relaxed">
          {summaryUser}
        </p>
        {summaryAr && summaryAr !== summaryUser && (
          <details className="mt-2 rounded-xl bg-ivory-50 px-3 py-2 text-sm">
            <summary className="cursor-pointer text-xs font-semibold text-green-600">{t("summaryAr")}</summary>
            <p dir="rtl" lang="ar" className="mt-2 whitespace-pre-wrap leading-relaxed">
              {summaryAr}
            </p>
          </details>
        )}
      </section>
      {rows.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold text-green-600">{t("pillars")}</h3>
          <dl className="divide-y divide-sand-200 rounded-xl border border-sand-200">
            {rows.map((r) => (
              <div key={r.key} className="grid gap-1 px-3 py-2 sm:grid-cols-2 sm:gap-4">
                <dt dir={dirForText(r.label)} className="text-sm text-ink-600">
                  {r.label}
                  {r.generated ? <span className="ms-1 text-[11px] text-green-600">({t("generated")})</span> : null}
                </dt>
                <dd dir={dirForText(r.value)} className="text-sm font-semibold">
                  {r.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <section>
        <h3 className="mb-1 text-xs font-semibold text-green-600">{t("unknowns")}</h3>
        {unknowns.length ? (
          <ul className="list-inside list-disc space-y-0.5 text-sm text-ink-600">
            {unknowns.map((u) => (
              <li key={u.key} dir={dirForText(u.label)}>
                {u.label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-600">{t("noUnknowns")}</p>
        )}
      </section>
    </div>
  );
}
