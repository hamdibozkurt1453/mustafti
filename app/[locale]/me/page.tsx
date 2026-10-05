import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ExpertAvatar } from "@/components/experts/ExpertAvatar";
import { ExpertProfileCard, VerifiedBadge } from "@/components/experts/ExpertProfileCard";
import { ProfileEditor } from "@/components/experts/ProfileEditor";
import { ShareProfile } from "@/components/experts/ShareProfile";
import { AccountForm } from "@/components/me/AccountForm";
import { DeleteAccount } from "@/components/me/DeleteAccount";
import { MePrayerSettings } from "@/components/me/MePrayerSettings";
import { MyCases } from "@/components/me/MyCases";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/locales";
import { ME_TABS, resolveTab, type MeTab } from "@/lib/account/rules";
import { getAuthContext, roleSatisfies } from "@/lib/auth/roles";
import { countryOptions } from "@/lib/experts/countries";
import { ownExpertProfile } from "@/lib/experts/store";
import { settingsFromProfile } from "@/lib/prayer/times";
import { isAdminClientConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "me" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** أصل الموقع للرابط العام (mustafti.com أو رابط المعاينة). */
async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "mustafti.com";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

const card = "rounded-[24px] border border-sand-200 bg-white p-6 sm:p-8";

/**
 * `/me` — «حسابي» (R2): «حسابي» و«ملفي الشخصي» في صفحة واحدة بتبويبات (?tab=):
 * الملف · مسائلي · مشاركاتي في الحوار · ملفي العام (للمختص المقبول فقط) · الإعدادات.
 * كل قراءة بجلسة المستخدم (RLS)، وحالة المختص تُفحص من القاعدة لكل طلب (getAuthContext).
 */
export default async function MePage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout

  const ctx = await getAuthContext();
  if (!roleSatisfies(ctx.role, ["user"])) {
    redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/me`)}`);
  }
  const userId = ctx.userId!;

  const t = await getTranslations("me");
  const tr = await getTranslations("auth");
  const tp = await getTranslations("experts.profile");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, preferred_lang, city, calc_method")
    .eq("id", userId)
    .maybeSingle<{ display_name: string | null; preferred_lang: string | null; city: string | null; calc_method: string | null }>();

  const approved = ctx.expertStatus === "approved" && isAdminClientConfigured();
  const expert = approved ? await ownExpertProfile(userId) : null;
  const tab: MeTab = resolveTab((await searchParams).tab, Boolean(expert));
  const name = profile?.display_name || expert?.name || ctx.email?.split("@")[0] || "";
  const tabs = ME_TABS.filter((k) => k !== "public" || expert);

  return (
    <main className="relative flex-1 px-4 pb-14 pt-8 sm:pt-12">
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-64 bg-green-900" />
      <div className="mx-auto w-full max-w-4xl">
        {/* الرأس: الصورة الدائرية والاسم والبريد والدور */}
        <header className="mf-stagger flex flex-wrap items-center gap-5 text-ivory-50">
          <ExpertAvatar url={expert?.avatarUrl ?? null} name={name} size={84} />
          <div className="min-w-0">
            <h1 className="truncate font-display text-[28px] font-semibold leading-tight sm:text-[34px]">{name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ivory-50/75">
              <bdi dir="ltr">{ctx.email}</bdi>
              <span className="rounded-full bg-ivory-50/10 px-2.5 py-0.5 text-xs font-semibold text-gold-500">{tr(`roles.${ctx.role}`)}</span>
            </p>
          </div>
        </header>

        {/* التبويبات */}
        <nav aria-label={t("tabsLabel")} className="mf-no-scrollbar -mx-4 mt-8 overflow-x-auto px-4">
          <ul className="flex w-max gap-1 rounded-full bg-ivory-50 p-1 shadow-[0_18px_40px_-24px_rgb(4_48_31/0.5)]">
            {tabs.map((k) => (
              <li key={k}>
                <Link
                  href={{ pathname: "/me", query: k === "profile" ? {} : { tab: k } }}
                  aria-current={tab === k ? "page" : undefined}
                  scroll={false}
                  className={`mf-press block whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    tab === k ? "bg-green-900 text-ivory-50" : "text-green-900 hover:bg-green-900/5"
                  }`}
                >
                  {t(`tabs.${k}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div key={tab} className="mf-fade mt-6 space-y-6">
          {tab === "profile" && (
            <>
              <section className={card}>
                <h2 className="text-lg font-bold text-green-900">{t("profile.title")}</h2>
                <div className="mt-5">
                  <AccountForm initial={{ displayName: profile?.display_name ?? "", preferredLang: profile?.preferred_lang ?? locale }} />
                </div>
              </section>
              <section className={card}>
                <h2 className="text-lg font-bold text-green-900">{t("profile.prayerTitle")}</h2>
                <p className="mt-1 text-sm text-ink-600">{t("profile.prayerHint")}</p>
                <div className="mt-5">
                  <MePrayerSettings initial={settingsFromProfile(profile)} />
                </div>
              </section>
              {expert && (
                <section className={card}>
                  <h2 className="text-lg font-bold text-green-900">{t("profile.expertTitle")}</h2>
                  <p className="mt-1 text-sm text-ink-600">{tp("lead")}</p>
                  <div className="mt-5">
                    <ProfileEditor
                      userId={userId}
                      countries={countryOptions(locale)}
                      initial={{
                        countryCode: expert.countryCode ?? "",
                        bio: expert.bio ?? "",
                        avatar: expert.avatarPath && expert.avatarUrl ? { path: expert.avatarPath, url: expert.avatarUrl } : null,
                        contact: expert.contact,
                        socials: expert.socials,
                      }}
                    />
                  </div>
                </section>
              )}
              {!expert && (
                <p className="text-sm text-ink-600">
                  {ctx.expertStatus ? t("profile.applicationHint") : t("profile.joinHint")}{" "}
                  <Link href="/experts/join" className="font-semibold text-green-600 underline underline-offset-4">
                    {ctx.expertStatus ? t("profile.applicationLink") : t("profile.joinLink")}
                  </Link>
                </p>
              )}
            </>
          )}

          {tab === "cases" && (
            <div className={card}>
              <MyCases userId={userId} locale={locale} />
            </div>
          )}

          {tab === "forum" && (
            <section className={`${card} text-center`}>
              <p className="font-display text-2xl font-semibold text-green-900">{t("forum.title")}</p>
              <p className="mx-auto mt-2 max-w-md text-ink-600">{t("forum.empty")}</p>
              <Link href="/forum" className="mf-press mt-6 inline-block rounded-full bg-green-900 px-5 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-green-600">
                {t("forum.cta")}
              </Link>
            </section>
          )}

          {tab === "public" && expert && (
            <>
              <section className="rounded-[24px] border border-sand-200 bg-ivory-50 p-6 sm:p-8">
                <ExpertProfileCard expert={expert} badge={<VerifiedBadge />} />
                <p className="mt-5 text-xs text-ink-600">{tp("readOnlyNote")}</p>
              </section>
              <section className={`${card} space-y-4`}>
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="text-lg font-bold text-green-900">{tp("publicTitle")}</h2>
                  <p className="text-sm text-ink-600">
                    {tp("answered")}: <strong className="font-display text-2xl text-green-900 tabular-nums">{expert.answered}</strong>
                  </p>
                </div>
                {expert.slug && (
                  <ShareProfile url={`${await siteOrigin()}/${locale}/experts/${expert.slug}`} text={`${tp("shareText")} — ${expert.name}`} />
                )}
              </section>
            </>
          )}

          {tab === "settings" && (
            <>
              <section className={card}>
                <h2 className="text-lg font-bold text-green-900">{t("settings.downloadTitle")}</h2>
                <p className="mt-1 text-sm text-ink-600">{t("settings.downloadHint")}</p>
                <a
                  href="/api/me/export"
                  download
                  className="mf-press mt-5 inline-flex items-center gap-2 rounded-full bg-green-900 px-5 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-green-600"
                >
                  {t("settings.download")}
                  <span aria-hidden>↓</span>
                </a>
              </section>
              <section className="rounded-[24px] border border-alert-600/25 bg-white p-6 sm:p-8">
                <h2 className="text-lg font-bold text-alert-600">{t("settings.deleteTitle")}</h2>
                <p className="mt-1 text-sm text-ink-600">{t("settings.deleteHint")}</p>
                <div className="mt-5">
                  {ctx.adminRole ? <p className="text-sm text-ink-600">{t("settings.errors.admin")}</p> : <DeleteAccount />}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
