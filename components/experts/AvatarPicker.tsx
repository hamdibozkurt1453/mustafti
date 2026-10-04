"use client";

import { useTranslations } from "next-intl";
import { useState, type ChangeEvent } from "react";
import { AVATAR_BUCKET, AVATAR_SIZE, MAX_AVATAR_BYTES } from "@/lib/experts/types";
import { createClient } from "@/lib/supabase/client";

/** يقصّ الصورة مربعاً من وسطها ويصغّرها إلى 512×512 بصيغة JPEG. */
async function squareCrop(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  if (!blob) throw new Error("encode");
  return blob;
}

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * الصورة الشخصية (اختيارية): قصّ مربع تلقائي من الوسط، وتُعرض دائرية.
 * تُرفع بجلسة المستخدم إلى المخزن العام expert-avatars/{user_id}/ (سياسات المخزن تمنع غير مجلده)،
 * ثم يتحقق الخادم من المسار عند الحفظ.
 */
export function AvatarPicker({
  userId,
  url,
  onChange,
}: {
  userId: string;
  url: string | null;
  onChange: (value: { path: string; url: string } | null) => void;
}) {
  const t = useTranslations("experts.profile");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setError(t("avatarType"));
    if (file.size > 15 * 1024 * 1024) return setError(t("avatarSize"));
    setBusy(true);
    try {
      const blob = await squareCrop(file);
      if (blob.size > MAX_AVATAR_BYTES) return setError(t("avatarSize"));
      const supabase = createClient();
      const path = `${userId}/avatar-${randomId()}.jpg`;
      const { error: upError } = await supabase.storage.from(AVATAR_BUCKET).upload(path, blob, { contentType: "image/jpeg" });
      if (upError) return setError(t("avatarUpload"));
      onChange({ path, url: supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl });
    } catch {
      setError(t("avatarUpload"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" width={88} height={88} className="size-22 rounded-full border-2 border-gold-500 object-cover" />
      ) : (
        <span aria-hidden className="inline-flex size-22 items-center justify-center rounded-full border-2 border-dashed border-sand-200 bg-white text-3xl text-ink-600">
          +
        </span>
      )}
      <div className="space-y-1.5">
        <span className="block text-sm font-semibold text-green-900">{t("avatar")}</span>
        <div className="flex flex-wrap gap-2">
          <label className="cursor-pointer rounded-full border border-green-900/20 bg-white px-4 py-1.5 text-sm font-semibold text-green-900 hover:bg-green-900/5">
            {busy ? t("avatarUploading") : url ? t("avatarChange") : t("avatarPick")}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={pick} />
          </label>
          {url && (
            <button type="button" onClick={() => onChange(null)} className="text-sm text-alert-600 underline">
              {t("avatarRemove")}
            </button>
          )}
        </div>
        <span className="block text-xs text-ink-600">{t("avatarHint")}</span>
        {error && (
          <span role="alert" className="block text-xs text-alert-600">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
