"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import { Link } from "@/i18n/navigation";
import { requestPasswordReset, updatePassword, type ResetFormState } from "@/lib/auth/actions";
import { PasswordInput } from "./PasswordInput";

const fieldClass =
  "w-full rounded-xl border border-sand-200 bg-white px-4 py-3 text-green-900 outline-none transition placeholder:text-ink-600/60 focus:border-green-600 focus:ring-2 focus:ring-green-600/20";
const buttonClass =
  "w-full rounded-full bg-gold-500 px-5 py-3 font-semibold text-green-900 transition hover:brightness-105 disabled:opacity-60";

function ErrorLine({ error }: { error?: ResetFormState["error"] }) {
  const t = useTranslations("auth");
  if (!error) return null;
  return (
    <p role="alert" className="rounded-xl border border-alert-600/30 bg-alert-600/5 px-4 py-3 text-sm text-alert-600">
      {t(`errors.${error}`)}
    </p>
  );
}

/** F1: «نسيت كلمة المرور؟»: البريد، ثم رسالة واحدة سواء وُجد الحساب أم لا. */
export function ResetRequestForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [state, submit, pending] = useActionState<ResetFormState, FormData>(requestPasswordReset, {});
  return (
    <div className="space-y-5">
      <ErrorLine error={state.error} />
      {state.sent ? (
        <p role="status" className="rounded-xl border border-green-600/30 bg-green-600/5 px-4 py-3 text-green-900">
          {t("sentReset")}
        </p>
      ) : (
        <form action={submit} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold">{t("email")}</span>
            <input name="email" type="email" required autoComplete="email" dir="ltr" className={fieldClass} />
          </label>
          <button type="submit" disabled={pending} className={buttonClass}>
            {pending ? t("sending") : t("sendReset")}
          </button>
        </form>
      )}
      <p className="text-center text-sm">
        <Link href="/login" className="font-semibold text-green-600 underline underline-offset-4">
          {t("backToLogin")}
        </Link>
      </p>
    </div>
  );
}

/** F1: كلمة المرور الجديدة بعد الضغط على رابط البريد (الجلسة مفتوحة من /api/auth/callback). */
export function UpdatePasswordForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [state, submit, pending] = useActionState<ResetFormState, FormData>(updatePassword, {});
  return (
    <div className="space-y-5">
      <ErrorLine error={state.error} />
      <form action={submit} className="space-y-4">
        <input type="hidden" name="locale" value={locale} />
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold">{t("newPassword")}</span>
          <PasswordInput name="password" required minLength={8} autoComplete="new-password" className={fieldClass} />
          <span className="block text-xs text-ink-600">{t("passwordHint")}</span>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold">{t("confirmPassword")}</span>
          <PasswordInput name="confirm" required minLength={8} autoComplete="new-password" className={fieldClass} />
        </label>
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? t("sending") : t("savePassword")}
        </button>
      </form>
    </div>
  );
}
