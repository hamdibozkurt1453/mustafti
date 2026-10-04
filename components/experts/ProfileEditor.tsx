"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateOwnProfile } from "@/lib/experts/actions";
import { BIO_MAX, BIO_MIN } from "@/lib/experts/types";
import type { CountryOption } from "@/lib/experts/countries";
import { AvatarPicker } from "./AvatarPicker";
import { CountrySelect } from "./CountrySelect";
import { ContactSocialFields, contactSocialErrors, type ContactValue, type SocialsValue } from "./ContactSocialFields";

type Initial = {
  countryCode: string;
  bio: string;
  avatar: { path: string; url: string } | null;
  contact: ContactValue;
  socials: SocialsValue;
};

/** تعديل الملف الشخصي للمختص المقبول: الصورة والنبذة والتواصل والحسابات. الحفظ يُفحص في الخادم. */
export function ProfileEditor({ userId, initial, countries }: { userId: string; initial: Initial; countries: CountryOption[] }) {
  const t = useTranslations("experts.profile");
  const tj = useTranslations("experts.join");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Initial>(initial);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const bioLen = form.bio.trim().length;

  async function save() {
    setShowErrors(true);
    setMessage(null);
    if (!form.countryCode || bioLen < BIO_MIN || bioLen > BIO_MAX || contactSocialErrors(form.contact, form.socials).size) {
      setMessage({ ok: false, text: t("errors.invalid") });
      return;
    }
    setBusy(true);
    const res = await updateOwnProfile({
      countryCode: form.countryCode,
      bio: form.bio,
      avatarPath: form.avatar?.path ?? null,
      contact: { phone: form.contact.phone.trim(), email: form.contact.email.trim() },
      socials: Object.fromEntries(Object.entries(form.socials).filter(([, v]) => v?.trim())),
    }).catch(() => ({ ok: false as const, error: "generic" }));
    setBusy(false);
    if (!res.ok) {
      setMessage({ ok: false, text: t(`errors.${res.error}` as "errors.generic") });
      return;
    }
    setMessage({ ok: true, text: t("saved") });
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full border border-green-900/20 bg-white px-5 py-2.5 text-sm font-semibold text-green-900 hover:bg-green-900/5"
        >
          {t("edit")}
        </button>
        {message && (
          <p role="status" className={`text-sm ${message.ok ? "text-green-600" : "text-alert-600"}`}>
            {message.text}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <AvatarPicker userId={userId} url={form.avatar?.url ?? null} onChange={(v) => setForm((f) => ({ ...f, avatar: v }))} />
      <label className="block space-y-1.5">
        <span className="text-sm font-semibold text-green-900">{t("country")}</span>
        <CountrySelect
          value={form.countryCode}
          options={countries}
          onChange={(v) => setForm((f) => ({ ...f, countryCode: v }))}
          placeholder={tj("countryPick")}
          invalid={showErrors && !form.countryCode}
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-semibold text-green-900">{t("bio")}</span>
        <textarea
          rows={5}
          maxLength={BIO_MAX}
          value={form.bio}
          onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
          className={`w-full rounded-xl border bg-white px-4 py-3 text-green-900 outline-none focus:border-green-600 ${
            showErrors && (bioLen < BIO_MIN || bioLen > BIO_MAX) ? "border-alert-600" : "border-sand-200"
          }`}
        />
        <span className="block text-xs text-ink-600">{t("bioHint", { min: BIO_MIN, max: BIO_MAX, n: bioLen })}</span>
      </label>
      <ContactSocialFields
        contact={form.contact}
        socials={form.socials}
        onContact={(v) => setForm((f) => ({ ...f, contact: v }))}
        onSocials={(v) => setForm((f) => ({ ...f, socials: v }))}
        showErrors={showErrors}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={save} className="rounded-full bg-gold-500 px-6 py-2.5 font-semibold text-green-900 disabled:opacity-60">
          {busy ? t("saving") : t("save")}
        </button>
        <button
          type="button"
          onClick={() => {
            setForm(initial);
            setShowErrors(false);
            setMessage(null);
            setOpen(false);
          }}
          className="rounded-full border border-green-900/20 px-5 py-2.5 font-semibold text-green-900"
        >
          {t("cancel")}
        </button>
      </div>
      {message && (
        <p role="status" className={`text-sm ${message.ok ? "text-green-600" : "text-alert-600"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
