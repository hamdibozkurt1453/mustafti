"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { AvatarPicker } from "@/components/experts/AvatarPicker";
import { updateProfileCard } from "@/lib/account/actions";
import { BIO_MAX } from "@/lib/account/rules";

type Avatar = { path: string; url: string } | null;

/**
 * F1: «الصورة والنبذة» للمستخدم والمشرف (كالتي عند المختص): صورة دائرية تُرفع إلى مجلده في المخزن العام،
 * ونبذة قصيرة. الصورة تظهر في زر «حسابي» وفي «الحوار» بدل الحرف الأول.
 */
export function ProfileCardForm({ userId, initial }: { userId: string; initial: { avatar: Avatar; bio: string } }) {
  const t = useTranslations("me.profile");
  const router = useRouter();
  const id = useId();
  const [avatar, setAvatar] = useState<Avatar>(initial.avatar);
  const [bio, setBio] = useState(initial.bio);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const changed = (avatar?.path ?? null) !== (initial.avatar?.path ?? null) || bio !== initial.bio;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await updateProfileCard({ avatarPath: avatar?.path ?? null, bio }).catch(() => ({ ok: false as const, error: "generic" as const }));
    setBusy(false);
    setMessage(res.ok ? { ok: true, text: t("saved") } : { ok: false, text: res.error === "notConfigured" ? t("cardUnavailable") : t("error") });
    if (res.ok) router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <AvatarPicker userId={userId} url={avatar?.url ?? null} onChange={setAvatar} />
      <div>
        <label htmlFor={`${id}-bio`} className="block text-sm font-semibold text-green-900">{t("bio")}</label>
        <textarea
          id={`${id}-bio`}
          value={bio}
          maxLength={BIO_MAX}
          rows={3}
          dir="auto"
          placeholder={t("bioPlaceholder")}
          onChange={(e) => setBio(e.target.value)}
          className="mt-2 w-full resize-y rounded-xl border border-sand-200 bg-ivory-50 px-4 py-2.5 text-green-900 outline-none transition-colors focus:border-green-600"
        />
        <span className="mt-1 block text-end text-xs text-ink-600 tabular-nums">{bio.length}/{BIO_MAX}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy || !changed}
          className="mf-press rounded-full bg-gold-500 px-6 py-2.5 font-semibold text-green-900 hover:brightness-105 disabled:opacity-50"
        >
          {busy ? t("saving") : t("save")}
        </button>
        {message && (
          <p role="status" className={`text-sm ${message.ok ? "text-green-600" : "text-alert-600"}`}>{message.text}</p>
        )}
      </div>
    </form>
  );
}
