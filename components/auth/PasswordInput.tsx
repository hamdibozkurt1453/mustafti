"use client";

import { useTranslations } from "next-intl";
import { useState, type InputHTMLAttributes } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/icons";

/**
 * الحقل LTR دائماً، فالزر على يمينه بخصائص فيزيائية (right) لا منطقية.
 * F1: حقل كلمة المرور بزر العين لإظهارها وإخفائها (زر حقيقي يُقرأ اسمه، ولا يرسل النموذج).
 */
export function PasswordInput({ className = "", ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const t = useTranslations("auth");
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={shown ? "text" : "password"} dir="ltr" className={`${className} pr-12`} />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? t("hidePassword") : t("showPassword")}
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-ink-600 transition hover:text-green-900"
      >
        {shown ? <EyeOffIcon className="size-5" /> : <EyeIcon className="size-5" />}
      </button>
    </div>
  );
}
