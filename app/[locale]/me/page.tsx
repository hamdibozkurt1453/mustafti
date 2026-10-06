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
import { MyCases } from "@/components/me/MyCases";
import { MyConversations } from "@/components/me/MyConversations";
import { MyForum } from "@/components/me/MyForum";
import { ProfileCardForm } from "@/components/me/ProfileCardForm";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/locales";
import { ME_TABS, profileSections, resolveTab, type MeTab } from "@/lib/account/rules";
import { getAuthContext, roleSatisfies } from "@/lib/auth/roles";
import { countryOptions } from "@/lib/experts/countries";
import { avatarUrl } from "@/lib/experts/types";
import { ownExpertProfile } from "@/lib/experts/store";
import { isAdminClientConfigured } from "@/lib/supabase/admin";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string | string[]; password?: string }>;
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
 * الملف · محادثاتي (F5) · مسائلي · مشاركاتي في الحوار · ملفي العام (للمختص المقبول فقط) · الإعدادات.
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

  // F1: الصورة والنبذة (قبل migration ‏20261012_profile_avatar_bio.sql يفشل الاستعلام فتبقيان فارغتين).
  const { data: extras } = await supabase
    .from("profiles")
    .select("avatar_path, bio")
    .eq("id", userId)
    .maybeSingle<{ avatar_path: string | null; bio: string | null }>();
  const ownAvatarUrl = avatarUrl(extras?.avatar_path, SUPABASE_URL);

  const approved = ctx.expertStatus === "approved" && isAdminClientConfigured();
  const expert = approved ? await ownExpertProfile(userId) : null;
  const query = await searchParams;
  const tab: MeTab = resolveTab(query.tab, Boolean(expert));
  const name = profile?.display_name || expert?.name || ctx.email?.split("@")[0] || "";
  const tabs = ME_TABS.filter((k) => k !== "public" || expert);

  return (
    <main className="relative flex-1 px-4 pb-14 pt-8 sm:pt-12">
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-64 bg-green-900" />
      <div className="mx-auto w-full max-w-4xl">
        {/* الرأس: الصورة الدائرية والاسم والبريد والدور */}
        <header className="mf-stagger flex flex-wrap items-center gap-5 text-ivory-50">
          <ExpertAvatar url={ownAvatarUrl ?? expert?.avatarUrl ?? null} name={name} size={84} />
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
          {/* F1: بعد تحديث كلمة المرور من رابط إعادة التعيين. */}
          {query.password === "updated" && (
            <p role="status" className="rounded-2xl border border-green-600/30 bg-white px-4 py-3 text-sm font-semibold text-green-600">
              {tr("passwordUpdated")}
            </p>
          )}
          {tab === "profile" && (
            <>
              {/* F1: «بياناتي» ثم «الصورة والنبذة» عند الجميع (profileSections). F2: المواقيت آلية، فلا قسم لها هنا. */}
              {profileSections(Boolean(expert)).map((section) => {
                if (section === "account")
                  return (
                    <section key={section} className={card}>
                      <h2 className="text-lg font-bold text-green-900">{t("profile.title")}</h2>
                      <div className="mt-5">
                        <AccountForm initial={{ displayName: profile?.display_name ?? "", preferredLang: profile?.preferred_lang ?? locale }} />
                      </div>
                    </section>
                  );
                if (section === "expertCard" && expert)
                  return (
                    <section key={section} className={card}>
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
                  );
                if (section === "userCard")
                  return (
                    <section key={section} className={card}>
                      <h2 className="text-lg font-bold text-green-900">{t("profile.expertTitle")}</h2>
                      <p className="mt-1 text-sm text-ink-600">{t("profile.cardHint")}</p>
                      <div className="mt-5">
                        <ProfileCardForm
                          userId={userId}
                          initial={{
                            avatar: extras?.avatar_path && ownAvatarUrl ? { path: extras.avatar_path, url: ownAvatarUrl } : null,
                            bio: extras?.bio ?? "",
                          }}
                        />
                      </div>
                    </section>
                  );
                return null;
              })}
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

          {tab === "conversations" && (
            <div className={card}>
              <MyConversations />
            </div>
          )}

          {tab === "cases" && (
            <div className={card}>
              <MyCases userId={userId} locale={locale} />
            </div>
          )}

          {tab === "forum" && (
            <section className={card}>
              <MyForum userId={userId} />
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
