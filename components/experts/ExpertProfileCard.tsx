import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { countryName } from "@/lib/experts/countries";
import { languageName } from "@/lib/experts/format";
import type { PublicExpert } from "@/lib/experts/store";
import { ExpertAvatar } from "./ExpertAvatar";
import { SocialLinks } from "./SocialLinks";

/**
 * بطاقة الملف (مشتركة بين «ملفي الشخصي» والصفحة العامة): الصورة، والاسم، والدور، والتخصص، والبلد،
 * واللغات، والنبذة، والحسابات، وعدد المسائل المجاب عنها. لا تواصل (هاتف أو بريد) هنا أبداً.
 */
export async function ExpertProfileCard({ expert, badge }: { expert: PublicExpert; badge?: ReactNode }) {
  const t = await getTranslations("experts.profile");
  const tj = await getTranslations("experts.join");
  const locale = await getLocale();
  const rows: [string, string][] = [
    [t("role"), tj(`roles.${expert.role}`)],
    [t("specialty"), expert.specialty ?? "—"],
    [t("country"), countryName(expert.countryCode, locale) ?? expert.country ?? "—"],
    [t("languages"), expert.languages.map((l) => languageName(l, locale)).join(locale === "ar" ? "، " : ", ")],
  ];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-5">
        <ExpertAvatar url={expert.avatarUrl} name={expert.name} size={112} />
        <div className="space-y-2">
          <h1 dir="auto" className="font-display text-[26px] font-bold leading-snug text-green-900 sm:text-[30px]">
            {expert.name}
          </h1>
          {badge}
          <p className="text-sm text-ink-600">
            <bdi className="text-lg font-bold text-green-900">{expert.answered}</bdi> {t("answered")}
          </p>
        </div>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-ink-600">{k}</dt>
            <dd dir="auto" className="font-semibold text-green-900">
              {v}
            </dd>
          </div>
        ))}
      </dl>
      {expert.bio && (
        <p dir="auto" className="whitespace-pre-wrap leading-relaxed text-green-900">
          {expert.bio}
        </p>
      )}
      <SocialLinks socials={expert.socials} />
    </div>
  );
}

/** شارة «مختص موثَّق من مُستفتي». */
export async function VerifiedBadge() {
  const t = await getTranslations("experts.profile");
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-600 px-3 py-1 text-xs font-semibold text-ivory-50">
      <span aria-hidden>✓</span>
      {t("verified")}
    </span>
  );
}
