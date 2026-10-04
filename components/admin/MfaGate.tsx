"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type Step =
  | { kind: "loading" }
  | { kind: "enroll"; factorId: string; qr: string; secret: string }
  | { kind: "challenge"; factorId: string };

/**
 * شاشة MFA (TOTP من Supabase Auth) قبل لوحة المشرف.
 * - بلا عامل مفعّل: يسجّل تطبيق مصادقة (رمز QR) ثم يتحقق.
 * - بعامل مفعّل: يطلب الرمز فقط.
 * بعد التحقق تصبح الجلسة aal2، ويعيد الخادم رسم الصفحة فيفتح اللوحة.
 */
export function MfaGate() {
  const t = useTranslations("admin");
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      const verified = data?.totp.find((f) => f.status === "verified");
      if (verified) {
        setStep({ kind: "challenge", factorId: verified.id });
        return;
      }
      // نظّف محاولات تسجيل سابقة لم تكتمل، ثم سجّل عاملاً جديداً.
      for (const f of data?.all ?? []) {
        if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Mustafti ${new Date().toISOString().slice(0, 10)}`,
      });
      if (enrollError || !enrolled) {
        setError(true);
        return;
      }
      setStep({ kind: "enroll", factorId: enrolled.id, qr: enrolled.totp.qr_code, secret: enrolled.totp.secret });
    })();
  }, []);

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (step.kind === "loading") return;
    setBusy(true);
    setError(false);
    const { error: verifyError } = await createClient().auth.mfa.challengeAndVerify({
      factorId: step.factorId,
      code: code.trim(),
    });
    setBusy(false);
    if (verifyError) {
      setError(true);
      setCode("");
      return;
    }
    router.refresh();
  }

  if (step.kind === "loading") {
    return <p className="text-ink-600">{error ? t("mfaError") : t("mfaLoading")}</p>;
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      <p className="text-ink-600">{step.kind === "enroll" ? t("mfaEnrollLead") : t("mfaChallengeLead")}</p>

      {step.kind === "enroll" && (
        <div className="space-y-3 text-center">
          {/* رمز QR من Supabase بصيغة data:image/svg+xml */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={step.qr} alt="QR" width={200} height={200} className="mx-auto rounded-xl bg-white p-2" />
          <p className="text-sm text-ink-600">{t("mfaSecret")}</p>
          <code dir="ltr" className="block break-all rounded-lg bg-white px-3 py-2 text-sm text-green-900">
            {step.secret}
          </code>
        </div>
      )}

      <label className="block space-y-1.5">
        <span className="text-sm font-semibold">{t("mfaCode")}</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          required
          dir="ltr"
          className="w-full rounded-xl border border-sand-200 bg-white px-4 py-3 text-center text-xl tracking-[0.4em] text-green-900 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20"
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-alert-600">
          {t("mfaError")}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || code.length !== 6}
        className="w-full rounded-full bg-gold-500 px-5 py-3 font-semibold text-green-900 transition hover:brightness-105 disabled:opacity-60"
      >
        {t("mfaVerify")}
      </button>
    </form>
  );
}
