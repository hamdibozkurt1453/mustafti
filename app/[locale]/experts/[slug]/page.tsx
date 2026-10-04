import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ExpertProfileCard, VerifiedBadge } from "@/components/experts/ExpertProfileCard";
import type { Locale } from "@/i18n/locales";
import { publicExpertBySlug } from "@/lib/experts/store";
import { isAdminClientConfigured } from "@/lib/supabase/admin";

type Props = { params: Promise<{ locale: string; slug: string }> };

async function load(slug: string) {
  await connection(); // يُرسم لكل طلب: القبول والعدد يتغيران
  return isAdminClientConfigured() ? publicExpertBySlug(decodeURIComponent(slug)) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const expert = await load(slug);
  if (!expert) return { robots: { index: false } };
  const t = await getTranslations({ locale: locale as Locale, namespace: "experts.profile" });
  const title = `${expert.name} — ${t("verified")}`;
  const description = (expert.bio ?? expert.specialty ?? "").slice(0, 200);
  const images = expert.avatarUrl ? [{ url: expert.avatarUrl, width: 512, height: 512, alt: expert.name }] : undefined;
  return {
    title,
    description,
    alternates: { canonical: `/${locale}/experts/${expert.slug}` },
    openGraph: { type: "profile", title, description, url: `/${locale}/experts/${expert.slug}`, images },
    twitter: { card: "summary", title, description, images: images?.map((i) => i.url) },
  };
}

/**
 * `/experts/[slug]` — الملف العام للمختص المقبول فقط (وإلا 404).
 * يعرض البطاقة وشارة «مختص موثَّق من مُستفتي» وعدد المسائل المجاب عنها،
 * ولا يعرض الهاتف ولا البريد (لا يُقرآن في الاستعلام أصلاً)، ولا أي مسألة ولا نصها.
 */
export default async function PublicExpertPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout
  const expert = await load(slug);
  if (!expert) notFound();
  const t = await getTranslations("experts.profile");

  return (
    <main className="relative flex-1 px-4 py-10 sm:py-14">
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-56 bg-green-900" />
      <div className="mx-auto w-full max-w-3xl rounded-[var(--radius-mf)] border border-sand-200 bg-ivory-50 p-6 shadow-[0_24px_60px_-30px_rgb(4_48_31/0.45)] sm:p-8">
        <ExpertProfileCard expert={expert} badge={<VerifiedBadge />} />
        <p className="mt-6 border-t border-sand-200 pt-4 text-xs text-ink-600">{t("publicNote")}</p>
      </div>
    </main>
  );
}
