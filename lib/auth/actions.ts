"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { locales } from "@/i18n/locales";
import { bootstrapAdmin } from "@/lib/auth/bootstrap-admin";
import { safeNext } from "@/lib/auth/safe-next";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type AuthFormState = {
  error?: "invalid" | "unconfirmed" | "weakPassword" | "exists" | "rateLimited" | "notConfigured" | "generic";
  /** أُرسلت رسالة بريد (رابط سحري أو تأكيد حساب). */
  sent?: "magic" | "confirm";
};

const MIN_PASSWORD = 8;

function readForm(formData: FormData) {
  const raw = String(formData.get("locale") ?? "ar");
  const locale = (locales as readonly string[]).includes(raw) ? raw : "ar";
  return {
    locale,
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
    displayName: String(formData.get("displayName") ?? "").trim().slice(0, 80),
    next: safeNext(String(formData.get("next") ?? ""), locale),
  };
}

/** أصل الموقع (https://mustafti.com أو رابط المعاينة) لروابط البريد. */
async function siteOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "mustafti.com";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

function callbackUrl(origin: string, next: string) {
  return `${origin}/api/auth/callback?next=${encodeURIComponent(next)}`;
}

function mapError(message: string, code?: string): AuthFormState["error"] {
  if (code === "email_not_confirmed") return "unconfirmed";
  if (code === "invalid_credentials") return "invalid";
  if (code === "user_already_exists" || code === "email_exists") return "exists";
  if (code === "weak_password") return "weakPassword";
  if (code?.includes("rate_limit") || /rate limit/i.test(message)) return "rateLimited";
  return "generic";
}

/** الدخول بالبريد وكلمة المرور (الطريقة الأساسية). */
export async function signInWithPassword(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return { error: "notConfigured" };
  const { email, password, next } = readForm(formData);
  if (!email || !password) return { error: "invalid" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: mapError(error.message, error.code) };

  await bootstrapAdmin(data.user);
  redirect(next);
}

/** إنشاء حساب بالبريد وكلمة المرور. يرسل Supabase رسالة تأكيد إن كان التأكيد مفعّلاً. */
export async function signUp(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return { error: "notConfigured" };
  const { email, password, displayName, locale, next } = readForm(formData);
  if (!email) return { error: "invalid" };
  if (password.length < MIN_PASSWORD) return { error: "weakPassword" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: callbackUrl(await siteOrigin(), next),
      data: { display_name: displayName, preferred_lang: locale },
    },
  });
  if (error) return { error: mapError(error.message, error.code) };

  // تأكيد البريد معطّل في Supabase ⇒ الجلسة جاهزة فوراً.
  if (data.session && data.user) {
    await bootstrapAdmin(data.user);
    redirect(next);
  }
  return { sent: "confirm" };
}

/** الرابط السحري (خيار ثانٍ، لأن بريد Supabase المجاني محدود في الساعة). */
export async function sendMagicLink(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return { error: "notConfigured" };
  const { email, locale, next } = readForm(formData);
  if (!email) return { error: "invalid" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: callbackUrl(await siteOrigin(), next),
      data: { preferred_lang: locale },
    },
  });
  if (error) return { error: mapError(error.message, error.code) };
  return { sent: "magic" };
}

// الدخول بـ Google: معطّل عمداً في نسخة التحدي.
// تفعيله يحتاج إنشاء OAuth Client في Google Cloud (Client ID وSecret) ولصقهما في
// Supabase ← Authentication ← Providers ← Google، وهذا مفتاح إضافي خارج نطاق S2.
// عند تفعيله: أضف هنا signInWithOAuth({ provider: "google", options: { redirectTo: callbackUrl(...) } })
// وأظهر الزر في components/auth/AuthForm.tsx (ابحث عن GOOGLE_ENABLED).

/** الخروج. */
export async function signOut(formData: FormData): Promise<void> {
  const raw = String(formData.get("locale") ?? "ar");
  const locale = (locales as readonly string[]).includes(raw) ? raw : "ar";
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect(`/${locale}`);
}
