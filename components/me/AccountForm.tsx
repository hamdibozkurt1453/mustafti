"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { localeNames, locales } from "@/i18n/locales";
import { updateAccount } from "@/lib/account/actions";
import { NAME_MAX } from "@/lib/account/rules";

/** «الملف»: الاسم الظاهر واللغة المفضّلة (profiles). */
export function AccountForm({ initial }: { initial: { displayName: string; preferredLang: string } }) {
  const t = useTranslations("me.profile");
  const router = useRouter();
  const id = useId();
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const changed = form.displayName !== initial.displayName || form.preferredLang !== initial.preferredLang;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await updateAccount(form).catch(() => ({ ok: false as const, error: "generic" as const }));
    setBusy(false);
    setMessage(res.ok ? { ok: true, text: t("saved") } : { ok: false, text: t("error") });
    if (res.ok) router.refresh();
  }

  const field = "mt-2 w-full rounded-xl border border-sand-200 bg-ivory-50 px-4 py-2.5 text-green-900 outline-none transition-colors focus:border-green-600";
  return (
    <form onSubmit={save} className="grid gap-5 sm:grid-cols-2">
      <div>
        <label htmlFor={`${id}-name`} className="block text-sm font-semibold text-green-900">{t("name")}</label>
        <input
          id={`${id}-name`}
          value={form.displayName}
          maxLength={NAME_MAX}
          onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
          className={field}
          autoComplete="name"
        />
      </div>
      <div>
        <label htmlFor={`${id}-lang`} className="block text-sm font-semibold text-green-900">{t("language")}</label>
        <select
          id={`${id}-lang`}
          value={form.preferredLang}
          onChange={(e) => setForm((f) => ({ ...f, preferredLang: e.target.value }))}
          className={field}
        >
          {locales.map((l) => (
            <option key={l} value={l}>{localeNames[l]}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
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
