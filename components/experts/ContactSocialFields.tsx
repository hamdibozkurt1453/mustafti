"use client";

import { useTranslations } from "next-intl";
import { normalizeSocial, PHONE_RE, SOCIAL_KEYS, type SocialKey } from "@/lib/experts/types";

export type ContactValue = { phone: string; email: string };
export type SocialsValue = Partial<Record<SocialKey, string>>;

const input =
  "w-full rounded-xl border border-sand-200 bg-white px-4 py-2.5 text-sm text-green-900 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20";
const bad = "border-alert-600";

/** أخطاء الصيغة (للعرض فقط؛ الخادم يعيد التحقق بالمخطط نفسه). */
export function contactSocialErrors(contact: ContactValue, socials: SocialsValue): Set<string> {
  const errors = new Set<string>();
  if (contact.phone.trim() && !PHONE_RE.test(contact.phone.trim())) errors.add("phone");
  if (contact.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact.email.trim())) errors.add("email");
  for (const k of SOCIAL_KEYS) if (socials[k]?.trim() && !normalizeSocial(k, socials[k]!)) errors.add(k);
  return errors;
}

/** وسائل التواصل (للمشرفين فقط) والحسابات (عامة)، كلها اختيارية. */
export function ContactSocialFields({
  contact,
  socials,
  onContact,
  onSocials,
  showErrors,
}: {
  contact: ContactValue;
  socials: SocialsValue;
  onContact: (v: ContactValue) => void;
  onSocials: (v: SocialsValue) => void;
  showErrors: boolean;
}) {
  const t = useTranslations("experts.profile");
  const errors = showErrors ? contactSocialErrors(contact, socials) : new Set<string>();
  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="font-semibold text-green-900">{t("contactTitle")}</legend>
        <p className="text-xs text-ink-600">{t("contactHint")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className={`${input} ${errors.has("phone") ? bad : ""}`}
            dir="ltr"
            inputMode="tel"
            placeholder={t("phone")}
            aria-label={t("phone")}
            maxLength={24}
            value={contact.phone}
            onChange={(e) => onContact({ ...contact, phone: e.target.value })}
          />
          <input
            className={`${input} ${errors.has("email") ? bad : ""}`}
            dir="ltr"
            type="email"
            placeholder={t("contactEmail")}
            aria-label={t("contactEmail")}
            maxLength={200}
            value={contact.email}
            onChange={(e) => onContact({ ...contact, email: e.target.value })}
          />
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="font-semibold text-green-900">{t("socialsTitle")}</legend>
        <p className="text-xs text-ink-600">{t("socialsHint")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {SOCIAL_KEYS.map((k) => (
            <label key={k} className="block space-y-1">
              <span className="text-xs font-semibold text-green-900">{t(`socials.${k}`)}</span>
              <input
                className={`${input} ${errors.has(k) ? bad : ""}`}
                dir="ltr"
                inputMode="url"
                placeholder={k === "website" ? "https://…" : `https://${k === "x" ? "x.com" : k === "telegram" ? "t.me" : `${k}.com`}/…`}
                maxLength={300}
                value={socials[k] ?? ""}
                onChange={(e) => onSocials({ ...socials, [k]: e.target.value })}
              />
            </label>
          ))}
        </div>
      </fieldset>
      {errors.size > 0 && (
        <p role="alert" className="text-sm text-alert-600">
          {t("linkInvalid")}
        </p>
      )}
    </div>
  );
}
