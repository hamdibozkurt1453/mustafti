/**
 * F3: قواعد النشرة البريدية، نقية بلا قاعدة ولا Next فتُختبر محلياً:
 * صيغة البريد، وحد السبام، ومعالجة طلب الاشتراك بتبعيات تُحقن (الحد والإدراج)، وتصدير CSV.
 */

import { locales } from "@/i18n/locales";

/** حد السبام: 5 محاولات اشتراك في الساعة لكل عنوان IP (rate_limits في القاعدة). */
export const NEWSLETTER_LIMIT_PER_HOUR = 5;

/**
 * يوحّد البريد ويتحقق من صيغته: جزء محلي وأحرف لاتينية لاسم النطاق بنقطة ونهاية من حرفين فأكثر،
 * بلا مسافات ولا نقطتين متتاليتين، وبطول 6–254. يعيد البريد بأحرف صغيرة، أو null.
 */
export function normalizeNewsletterEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return null;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.(?:[a-z]{2,24}|xn--[a-z0-9-]{1,59})$/.test(email)) return null;
  const [local] = email.split("@");
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || email.includes("..")) return null;
  return email;
}

export function newsletterLang(raw: unknown): string {
  return typeof raw === "string" && (locales as readonly string[]).includes(raw) ? raw : "ar";
}

export type SubscribeOutcome = "ok" | "already" | "invalid" | "limited" | "error";

export type SubscribeDeps = {
  /** يزيد عداد العنوان ويعيد true إن بقي ضمن الحد. */
  limit: () => Promise<boolean>;
  /** يدرج المشترك؛ "duplicate" إن كان البريد مشتركاً من قبل. */
  insert: (row: { email: string; lang: string }) => Promise<"ok" | "duplicate" | "error">;
};

/**
 * يعالج طلب الاشتراك: حقل الفخ (website) المملوء يُقبل بصمت بلا إدراج (بوت)،
 * ثم صيغة البريد، ثم حد السبام (قبل أي كتابة)، ثم الإدراج.
 */
export async function handleSubscribe(body: unknown, deps: SubscribeDeps): Promise<SubscribeOutcome> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (typeof b.website === "string" && b.website.trim()) return "ok";
  const email = normalizeNewsletterEmail(b.email);
  if (!email) return "invalid";
  if (!(await deps.limit())) return "limited";
  const res = await deps.insert({ email, lang: newsletterLang(b.lang) });
  return res === "duplicate" ? "already" : res;
}

export const OUTCOME_STATUS: Record<SubscribeOutcome, number> = { ok: 200, already: 200, invalid: 400, limited: 429, error: 503 };

/** خلية CSV آمنة: تهريب الاقتباس، ومنع حقن الصيغ في برامج الجداول (= + - @ في أولها). */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function subscribersCsv(rows: { email: string; lang: string; confirmed: boolean; created_at: string }[]): string {
  const lines = ["email,lang,confirmed,created_at", ...rows.map((r) => [cell(r.email), cell(r.lang), r.confirmed ? "true" : "false", cell(r.created_at)].join(","))];
  return `﻿${lines.join("\r\n")}\r\n`;
}
