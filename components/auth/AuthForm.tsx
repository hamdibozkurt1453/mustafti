"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Link } from "@/i18n/navigation";
import { PasswordInput } from "./PasswordInput";
import { sendMagicLink, signInWithPassword, signUp, type AuthFormState } from "@/lib/auth/actions";

// GOOGLE_ENABLED = false: الدخول بـ Google معطّل في نسخة التحدي (السبب في lib/auth/actions.ts).

type Props = {
  mode: "login" | "register";
  next?: string;
  /** خطأ قادم في الرابط (مثل ?error=link من رابط بريد منتهٍ). */
  initialError?: "link";
};

const fieldClass =
  "w-full rounded-xl border border-sand-200 bg-white px-4 py-3 text-green-900 outline-none transition placeholder:text-ink-600/60 focus:border-green-600 focus:ring-2 focus:ring-green-600/20";
const buttonClass =
  "w-full rounded-full bg-gold-500 px-5 py-3 font-semibold text-green-900 transition hover:brightness-105 disabled:opacity-60";

/** نموذج الدخول وإنشاء الحساب: كلمة المرور أساسية، والرابط السحري خيار ثانٍ (يُنشئ الحساب عند أول دخول). */
export function AuthForm({ mode, next = "", initialError }: Props) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [method, setMethod] = useState<"password" | "magic">("password");

  const passwordAction = mode === "login" ? signInWithPassword : signUp;
  const [pwState, pwSubmit, pwPending] = useActionState<AuthFormState, FormData>(passwordAction, {});
  const [mlState, mlSubmit, mlPending] = useActionState<AuthFormState, FormData>(sendMagicLink, {});

  const state = method === "password" ? pwState : mlState;
  // خطأ الرابط يظهر حتى أول محاولة جديدة فقط.
  const untouched = !pwState.error && !pwState.sent && !mlState.error && !mlState.sent;
  const error = state.error ?? (untouched ? initialError : undefined);

  const hidden = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="next" value={next} />
    </>
  );

  return (
    <div className="space-y-5">
      {/* F2: الطريقتان (كلمة المرور، ورابط على البريد) في الدخول والتسجيل معاً. */}
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-full bg-sand-200/60 p-1 text-sm font-semibold">
        {(["password", "magic"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={method === m}
            onClick={() => setMethod(m)}
            className={`rounded-full px-3 py-2 transition ${
              method === m ? "bg-white text-green-900 shadow-sm" : "text-ink-600 hover:text-green-900"
            }`}
          >
            {m === "password" ? t("methodPassword") : t("methodMagic")}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-alert-600/30 bg-alert-600/5 px-4 py-3 text-sm text-alert-600">
          {t(`errors.${error}`)}
        </p>
      )}

      {state.sent ? (
        <p role="status" className="rounded-xl border border-green-600/30 bg-green-600/5 px-4 py-3 text-green-900">
          {state.sent === "magic" ? t("sentMagic") : t("sentConfirm")}
        </p>
      ) : method === "password" ? (
        <form action={pwSubmit} className="space-y-4">
          {hidden}
          {mode === "register" && (
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold">{t("displayName")}</span>
              <input name="displayName" type="text" autoComplete="nickname" maxLength={80} className={fieldClass} />
            </label>
          )}
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold">{t("email")}</span>
            <input name="email" type="email" required autoComplete="email" dir="ltr" className={fieldClass} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold">{t("password")}</span>
            <PasswordInput
              name="password"
              required
              minLength={mode === "register" ? 8 : undefined}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              className={fieldClass}
            />
            {mode === "register" && <span className="block text-xs text-ink-600">{t("passwordHint")}</span>}
          </label>
          {/* F1: «نسيت كلمة المرور؟» خارج الحقل حتى لا يفتحه الضغط على العنوان. */}
          {mode === "login" && (
            <p className="-mt-2 text-end text-sm">
              <Link href="/auth/reset" className="font-semibold text-green-600 underline-offset-4 hover:underline">
                {t("forgot")}
              </Link>
            </p>
          )}
          <button type="submit" disabled={pwPending} className={buttonClass}>
            {pwPending ? t("sending") : mode === "login" ? t("signIn") : t("signUp")}
          </button>
        </form>
      ) : (
        <form action={mlSubmit} className="space-y-4">
          {hidden}
          <p className="text-sm text-ink-600">{t("magicHint")}</p>
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold">{t("email")}</span>
            <input name="email" type="email" required autoComplete="email" dir="ltr" className={fieldClass} />
          </label>
          <button type="submit" disabled={mlPending} className={buttonClass}>
            {mlPending ? t("sending") : t("sendMagic")}
          </button>
        </form>
      )}

      {/* GOOGLE_ENABLED: زر «المتابعة بـ Google» يُضاف هنا عند تفعيله. */}

      <p className="text-center text-sm text-ink-600">
        {mode === "login" ? t("noAccount") : t("haveAccount")}{" "}
        <Link
          href={{ pathname: mode === "login" ? "/register" : "/login", query: next ? { next } : {} }}
          className="font-semibold text-green-600 underline underline-offset-4"
        >
          {mode === "login" ? t("toRegister") : t("toLogin")}
        </Link>
      </p>
    </div>
  );
}
