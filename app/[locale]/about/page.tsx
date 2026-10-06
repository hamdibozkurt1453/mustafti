import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { InView } from "@/components/explore/InView";
import { SectionHead } from "@/components/explore/SectionHead";
import { GeometricPattern } from "@/components/home/GeometricPattern";
import { placeholderMetadata } from "@/components/PagePlaceholder";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/locales";
import { isEnabledHref } from "@/lib/config";
import { pageContent, REPO_URL } from "@/lib/pages/content";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return placeholderMetadata(locale, "about");
}

/**
 * إسناد المحتوى المستورد وتراخيصه (R1d). أسماء المصادر والتراخيص بنصها، فيُعرض الإسناد بالعربية
 * لصفحة العربية وبالإنجليزية لغيرها حتى تُترجم الصفحة كاملة.
 */
function Attribution({ ar }: { ar: boolean }) {
  const dataset = "https://huggingface.co/datasets/kingkaung/islamqainfo_parallel_corpus";
  const license = "https://creativecommons.org/licenses/by-nc/4.0/";
  return (
    <section className="rounded-[24px] border border-sand-200 bg-white p-6 sm:p-8" dir={ar ? "rtl" : "ltr"}>
      <h2 className="text-xl font-bold text-green-900">{ar ? "المصادر والتراخيص" : "Sources and licenses"}</h2>
      <p className="mt-3 text-ink-600">
        {ar ? (
          <>
            الفتاوى المنشورة من موقع{" "}
            <a href="https://islamqa.info" className="font-semibold text-green-600 underline underline-offset-4" target="_blank" rel="noopener noreferrer">
              الإسلام سؤال وجواب
            </a>{" "}
            (بإشراف الشيخ محمد صالح المنجد) تُعرض للاطلاع فقط بنصها ورابطها الأصلي، من المجموعة العامة{" "}
            <a href={dataset} className="underline underline-offset-4" target="_blank" rel="noopener noreferrer" dir="ltr">
              kingkaung/islamqainfo_parallel_corpus
            </a>{" "}
            على Hugging Face، بترخيص{" "}
            <a href={license} className="underline underline-offset-4" target="_blank" rel="noopener noreferrer" dir="ltr">
              CC BY-NC 4.0
            </a>{" "}
            (استعمال غير تجاري مع الإسناد). مُستفتي لا يغيّر نص الفتوى ولا يطبّقها على حالة السائل.
          </>
        ) : (
          <>
            Published fatwas from{" "}
            <a href="https://islamqa.info" className="font-semibold text-green-600 underline underline-offset-4" target="_blank" rel="noopener noreferrer">
              IslamQA (islamqa.info)
            </a>{" "}
            (supervised by Sheikh Muhammad Saalih al-Munajjid) are shown for reference only, verbatim and with their original link, from the public dataset{" "}
            <a href={dataset} className="underline underline-offset-4" target="_blank" rel="noopener noreferrer">
              kingkaung/islamqainfo_parallel_corpus
            </a>{" "}
            on Hugging Face, licensed{" "}
            <a href={license} className="underline underline-offset-4" target="_blank" rel="noopener noreferrer">
              CC BY-NC 4.0
            </a>{" "}
            (non-commercial use with attribution). Mustafti does not alter a fatwa or apply it to the asker&apos;s case.
          </>
        )}
      </p>
    </section>
  );
}

/** أيقونات خطية بهوية الموقع للمسارات الثلاثة. */
const PATH_ICONS = {
  ask: <path d="M5 5h14v10H9l-4 4V5zM9 9h6M9 12h4" />,
  newMuslim: <path d="M12 21s-7-4.6-7-10.5A4 4 0 0 1 12 8a4 4 0 0 1 7 2.5C19 16.4 12 21 12 21zM12 3v2M7.5 4.5l1 1.5M16.5 4.5l-1 1.5" />,
  discover: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5 5-2z" />,
} as const;
const PATHS = [
  { key: "ask", href: "/" },
  { key: "newMuslim", href: "/new-muslim" },
  { key: "discover", href: "/discover" },
] as const;
const HOW_STEPS = ["s1", "s2", "s3"] as const;
const SOURCE_KEYS = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11", "s12"] as const;

function Star({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className={`flex-none text-gold-500 ${className}`}>
      <path fill="currentColor" d="M10 0l2.5 7.5L20 10l-7.5 2.5L10 20l-2.5-7.5L0 10l7.5-2.5z" />
    </svg>
  );
}

/**
 * `/about` — عن مستفتي (F3، إعادة تصميم): هيرو بالنقش الهندسي، و«المسارات الثلاثة» بأيقونات،
 * و«كيف يعمل» بخطوات ثلاث وخط ذهبي يُرسم عند الظهور، و«المصادر المعتمدة»، و«الفريق والمسابقة»،
 * و«المختصون» و«مفتوح المصدر» (من lib/pages/content.ts)، ثم الإسناد. أيقونات SVG خطية، بلا صور.
 * النصوص من messages (paths وhow وsources وaboutPage) فتتبع اللغات الاثنتي عشرة.
 */
export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout
  const t = await getTranslations();
  const content = pageContent(locale, "about");
  const intro = content.sections[0];
  const experts = content.sections.find((s) => s.link?.href === "/experts/join");
  const openSource = content.sections.find((s) => s.link?.href === REPO_URL);
  const fmt = new Intl.NumberFormat(locale);

  return (
    <main className="flex-1">
      {/* الهيرو */}
      <section className="relative isolate overflow-hidden bg-green-900 text-ivory-50">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{ background: "radial-gradient(90% 70% at 50% -10%, rgb(10 107 69 / 0.8), transparent 65%), radial-gradient(60% 50% at 50% 120%, rgb(255 184 0 / 0.14), transparent 70%)" }}
        />
        <div aria-hidden className="absolute inset-0 -z-10 opacity-60 [mask-image:radial-gradient(ellipse_75%_80%_at_50%_30%,#000_20%,transparent_80%)]">
          <GeometricPattern className="h-full w-full" />
        </div>
        <div className="mf-stagger mx-auto max-w-4xl px-4 pb-16 pt-16 text-center sm:pb-24 sm:pt-24">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold-500">
            <Star />
            {t("aboutPage.kicker")}
          </p>
          <h1 className="mt-4 font-display text-[36px] font-semibold leading-tight sm:text-6xl">{t("pages.about.title")}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-ivory-50/85 sm:text-lg">{t("pages.about.description")}</p>
          {intro?.paras?.map((p) => (
            <p key={p} className="mx-auto mt-3 max-w-2xl leading-relaxed text-ivory-50/70">{p}</p>
          ))}
          <div>
            <Link href="/" className="mf-press mt-8 inline-flex items-center gap-2 rounded-full bg-gold-500 px-6 py-3 font-semibold text-green-900 hover:brightness-105">
              {t("aboutPage.start")}
              <span aria-hidden className="rtl:-scale-x-100">→</span>
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:py-20">
        {/* المسارات الثلاثة */}
        <InView as="section">
          <SectionHead kicker={t("aboutPage.pathsKicker")} title={t("paths.title")} />
          <ul className="mf-stagger mt-8 grid gap-5 md:grid-cols-3">
            {PATHS.filter((p) => isEnabledHref(p.href)).map((p) => (
              <li key={p.key}>
                <Link href={p.href} className="mf-lift group flex h-full flex-col rounded-[24px] border border-sand-200 bg-white p-6 hover:border-green-600/40">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-900 text-gold-500 transition-transform duration-500 group-hover:rotate-6">
                    <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      {PATH_ICONS[p.key]}
                    </svg>
                  </span>
                  <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-green-600">{t(`paths.${p.key}.kicker`)}</p>
                  <h3 className="mt-1 font-display text-xl font-semibold text-green-900">{t(`paths.${p.key}.title`)}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-600">{t(`paths.${p.key}.body`)}</p>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-green-600 transition-all group-hover:gap-2.5">
                    {t(`paths.${p.key}.cta`)}
                    <span aria-hidden className="rtl:-scale-x-100">→</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </InView>

        {/* كيف يعمل */}
        <InView as="section" className="group mt-20">
          <SectionHead kicker={t("how.kicker")} title={t("how.title")} />
          <ol className="relative mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
            <span aria-hidden className="absolute end-[16.6%] start-[16.6%] top-6 hidden h-px bg-sand-200 md:block" />
            <span
              aria-hidden
              className="absolute end-[16.6%] start-[16.6%] top-6 hidden h-[2px] origin-left scale-x-0 bg-gold-500 transition-transform delay-300 duration-[1400ms] ease-out group-data-[shown]:scale-x-100 motion-reduce:scale-x-100 rtl:origin-right md:block"
            />
            {HOW_STEPS.map((s, i) => (
              <li key={s} className="relative flex gap-4 md:flex-col md:items-center md:text-center">
                <span className="relative z-10 flex h-12 w-12 flex-none items-center justify-center rounded-full bg-green-900 font-display text-lg font-semibold text-gold-500 ring-8 ring-ivory-50">
                  {fmt.format(i + 1)}
                </span>
                <div
                  className="translate-y-3 opacity-0 transition duration-700 group-data-[shown]:translate-y-0 group-data-[shown]:opacity-100 motion-reduce:translate-y-0 motion-reduce:opacity-100"
                  style={{ transitionDelay: `${300 + i * 250}ms` }}
                >
                  <h3 className="font-display text-xl font-semibold text-green-900">{t(`how.steps.${s}.title`)}</h3>
                  <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-ink-600">{t(`how.steps.${s}.body`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </InView>

        {/* المصادر */}
        <InView as="section" className="mt-20">
          <div className="relative isolate overflow-hidden rounded-[32px] bg-green-900 p-6 text-ivory-50 sm:p-10">
            <div aria-hidden className="absolute -end-24 -top-24 -z-10 h-72 w-72 opacity-20">
              <GeometricPattern className="h-full w-full" />
            </div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold-500">
              <Star />
              {t("sources.title")}
            </p>
            <h2 className="mt-2 font-display text-[26px] font-semibold leading-tight sm:text-[32px]">{t("aboutPage.sourcesTitle")}</h2>
            <p className="mt-2 max-w-2xl text-ivory-50/80">{t("aboutPage.sourcesLead")}</p>
            <ul className="mf-stagger mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SOURCE_KEYS.map((k) => (
                <li key={k} className="flex items-center gap-3 rounded-2xl border border-ivory-50/10 bg-ivory-50/[0.05] px-4 py-3">
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-gold-500/40 text-gold-500">
                    <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5M12 6.5C14 5 17 4.5 20 5v13c-3-.5-6 0-8 1.5M12 6.5v13" />
                    </svg>
                  </span>
                  <span className="text-sm font-semibold leading-snug">{t(`sources.items.${k}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        </InView>

        {/* الفريق والمسابقة، والمختصون، ومفتوح المصدر */}
        <InView as="section" className="mt-20 grid gap-5 md:grid-cols-2">
          <div className="rounded-[24px] border border-sand-200 bg-white p-6 sm:p-8 md:col-span-2">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-500 text-green-900">
              <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
              </svg>
            </span>
            <h2 className="mt-5 font-display text-2xl font-semibold text-green-900">{t("aboutPage.teamTitle")}</h2>
            <p className="mt-2 leading-relaxed text-ink-600">{t("aboutPage.teamBody")}</p>
            <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-gold-50 px-4 py-1.5 text-sm font-semibold text-green-900">
              <Star />
              {t("aboutPage.teamChallenge")}
            </p>
          </div>
          {[experts, openSource].filter(Boolean).map((section) => (
            <div key={section!.title} className="flex flex-col rounded-[24px] border border-sand-200 bg-white p-6 sm:p-8">
              <h2 className="font-display text-xl font-semibold text-green-900">{section!.title}</h2>
              {section!.paras?.map((p) => (
                <p key={p} className="mt-2 leading-relaxed text-ink-600">{p}</p>
              ))}
              {section!.link &&
                (/^https?:/.test(section!.link.href) ? (
                  <a href={section!.link.href} target="_blank" rel="noopener noreferrer" className="mf-press mt-5 inline-flex w-fit items-center gap-2 rounded-full bg-green-900 px-5 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-green-600">
                    {section!.link.label}
                    <span aria-hidden>↗</span>
                  </a>
                ) : (
                  <Link href={section!.link.href} className="mf-press mt-5 inline-flex w-fit items-center gap-2 rounded-full border border-green-900/20 px-5 py-2.5 text-sm font-semibold text-green-900 hover:border-green-600 hover:bg-green-900/5">
                    {section!.link.label}
                    <span aria-hidden className="rtl:-scale-x-100">→</span>
                  </Link>
                ))}
            </div>
          ))}
        </InView>

        <div className="mt-5">
          <Attribution ar={locale === "ar"} />
        </div>
      </div>
    </main>
  );
}
