import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ExpertGate } from "@/components/experts/ExpertGate";
import { ExpertProfileCard, VerifiedBadge } from "@/components/experts/ExpertProfileCard";
import { ProfileEditor } from "@/components/experts/ProfileEditor";
import { ShareProfile } from "@/components/experts/ShareProfile";
import type { Locale } from "@/i18n/locales";
import { AuthzError, getAuthContext } from "@/lib/auth/roles";
import { ownExpertProfile, requireApprovedExpert, type ExpertSelf } from "@/lib/experts/store";
import { isAdminClientConfigured } from "@/lib/supabase/admin";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "experts.profile" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** أصل الموقع للرابط العام (mustafti.com أو رابط المعاينة). */
async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "mustafti.com";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

/**
 * `/expert/profile` — «ملفي الشخصي» للمختص المقبول (فحص الحالة من القاعدة لكل طلب):
 * البطاقة كما يراها العامة، والتعديل، ورابط الملف العام وأزرار المشاركة.
 */
export default async function ExpertProfilePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout

  const ctx = await getAuthContext();
  if (!ctx.userId) redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/expert/profile`)}`);
  if (!isAdminClientConfigured()) return <ExpertGate status={null} />;

  let self: ExpertSelf;
  try {
    self = await requireApprovedExpert();
  } catch (error) {
    if (error instanceof AuthzError) return <ExpertGate status={ctx.expertStatus} />;
    throw error;
  }

  const profile = await ownExpertProfile(self.id);
  if (!profile) return <ExpertGate status={null} />;

  const t = await getTranslations("experts.profile");
  const publicUrl = profile.slug ? `${await siteOrigin()}/${locale}/experts/${profile.slug}` : null;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-10 sm:py-14">
      <section className="rounded-[22px] border border-sand-200 bg-ivory-50 p-6 sm:p-8">
        <p className="mb-5 text-sm text-ink-600">{t("lead")}</p>
        <ExpertProfileCard expert={profile} badge={<VerifiedBadge />} />
        <p className="mt-5 text-xs text-ink-600">{t("readOnlyNote")}</p>
      </section>

      <section className="rounded-[22px] border border-sand-200 bg-white p-6">
        <ProfileEditor
          userId={self.id}
          initial={{
            bio: profile.bio ?? "",
            avatar: profile.avatarPath && profile.avatarUrl ? { path: profile.avatarPath, url: profile.avatarUrl } : null,
            contact: profile.contact,
            socials: profile.socials,
          }}
        />
      </section>

      {publicUrl && (
        <section className="space-y-3 rounded-[22px] border border-sand-200 bg-white p-6">
          <h2 className="font-bold text-green-900">{t("publicTitle")}</h2>
          <ShareProfile url={publicUrl} text={`${t("shareText")} — ${profile.name}`} />
        </section>
      )}
    </main>
  );
}
