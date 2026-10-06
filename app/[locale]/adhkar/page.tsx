import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdhkarList } from "@/components/adhkar/AdhkarList";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/locales";
import { OCCASIONS, type Occasion } from "@/lib/adhkar/rules";
import { groupAdhkar } from "@/lib/adhkar/group";
import { listAdhkar } from "@/lib/adhkar/store";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ c?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "adhkar" });
  return { title: t("title"), description: t("pageLead") };
}

const isOccasion = (v: unknown): v is Occasion => typeof v === "string" && (OCCASIONS as readonly string[]).includes(v);

/**
 * `/adhkar` — F2: صفحة الأذكار كاملة بالفئات الست (?c=): الصباح، والمساء، وقبل الصلاة، وبعد الصلاة،
 * والنوم، والاستيقاظ. من جدول adhkar (بذرة الأذكار المشهورة بتخريجها، وأذكار الموسوعة إن بُنيت).
 * صفحة ثانوية (لا في القائمة ولا في التذييل): رابط «كل الأذكار» من الأذكار الموقوتة في بطاقة المواقيت
 * يفتح الفئة المناسبة للوقت. F2b: الأذكار تُقرأ ولو رُفضت القراءة العامة (مفتاح الخادم احتياطاً).
 */
export default async function AdhkarPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout
  const t = await getTranslations("adhkar");
  const raw = (await searchParams).c;
  const c = Array.isArray(raw) ? raw[0] : raw;
  const items = await listAdhkar(locale);
  const groups = groupAdhkar(items);
  const available = OCCASIONS.filter((o) => groups[o].length > 0);
  const occasion: Occasion = isOccasion(c) ? c : (available[0] ?? "morning");
  const list = groups[occasion];

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
      <section className="mf-stagger relative isolate overflow-hidden rounded-[32px] bg-green-900 p-6 text-ivory-50 sm:p-10">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{ background: "radial-gradient(60% 80% at 85% 10%, rgb(255 184 0 / 0.14), transparent 70%), radial-gradient(80% 70% at 0% 100%, rgb(10 107 69 / 0.7), transparent 70%)" }}
        />
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-500">{t("kicker")}</p>
        <h1 className="mt-3 font-display text-[32px] font-semibold leading-tight sm:text-5xl">{t("title")}</h1>
        <p className="mt-3 max-w-2xl text-ivory-50/80 sm:text-[17px]">{t("pageLead")}</p>
        <nav aria-label={t("tabsLabel")} className="mt-6">
          <ul className="flex flex-wrap gap-2">
            {OCCASIONS.map((o) => (
              <li key={o}>
                <Link
                  href={{ pathname: "/adhkar", query: { c: o } }}
                  aria-current={o === occasion ? "page" : undefined}
                  scroll={false}
                  className={`mf-press inline-block rounded-full border px-4 py-1.5 text-sm transition-colors ${
                    o === occasion
                      ? "border-gold-500 bg-gold-500 font-semibold text-green-900"
                      : "border-ivory-50/20 text-ivory-50/90 hover:border-gold-500/70 hover:text-ivory-50"
                  }`}
                >
                  {t(`moments.${o}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </section>

      {items.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-sand-200 bg-white p-6 text-center text-ink-600">{t("empty")}</p>
      ) : (
        <AdhkarList key={occasion} items={list} occasion={occasion} showTransliteration={locale !== "ar"} />
      )}
      <p className="mt-6 text-xs leading-relaxed text-ink-600">{t("pageNote")}</p>
    </main>
  );
}
