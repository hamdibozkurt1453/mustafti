/**
 * قواعد لوحة المشرف (S10)، نقية بلا قاعدة بيانات فتُختبر محلياً.
 * من يرى أي تبويب، ومن يفعل ماذا، وانتقالات حالة الملف، وحسابات الإحصاءات.
 */

import type { AdminRole } from "@/lib/auth/role-rules";

export const CASE_STATUSES = ["clarifying", "submitted", "assigned", "answered", "closed"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const EXPERT_STATUSES = ["pending", "approved", "rejected"] as const;

export type AdminTab = "home" | "experts" | "cases" | "forum" | "newsletter" | "stats";

/** التبويبات الظاهرة لكل دور. viewer يرى الكل للاطلاع فقط. */
export function tabsFor(role: AdminRole): AdminTab[] {
  const tabs: AdminTab[] = ["home"];
  if (role === "super_admin" || role === "reviewer" || role === "viewer") tabs.push("experts");
  if (role === "super_admin" || role === "moderator" || role === "viewer") tabs.push("cases");
  // R4: «الحوار» للمشرفين عليه (moderator فأعلى)، وviewer للاطلاع.
  if (role === "super_admin" || role === "moderator" || role === "viewer") tabs.push("forum");
  // F3: «النشرة» (بريد المشتركين بيانات شخصية) للمشرف الأعلى وحده، ولا يراها حساب الاطلاع.
  if (role === "super_admin") tabs.push("newsletter");
  tabs.push("stats");
  return tabs;
}

/** أدوار أفعال الملفات (إعادة التوجيه والإغلاق). viewer ليس منها أبداً. */
export const CASE_ACTION_ROLES = ["super_admin", "moderator"] as const;

/** «إعادة التوجيه»: فك الإسناد والعودة إلى submitted، لملف مسند لم يُجب عنه بعد. */
export function canReassign(status: string): boolean {
  return status === "assigned";
}

/** «إغلاق»: كل ملف لم يُغلق بعد. */
export function canClose(status: string): boolean {
  return status !== "closed";
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** توقيت المنصة: الرياض، UTC+3 بلا توقيت صيفي. */
const PLATFORM_OFFSET = 3 * HOUR;

/** بداية اليوم بتوقيت الرياض، وبداية آخر 7 أيام (اليوم وستة قبله). */
export function statsWindows(now: Date): { dayStart: Date; weekStart: Date } {
  const local = now.getTime() + PLATFORM_OFFSET;
  const dayStart = Math.floor(local / DAY) * DAY - PLATFORM_OFFSET;
  return { dayStart: new Date(dayStart), weekStart: new Date(dayStart - 6 * DAY) };
}

/** نسبة مئوية مقربة، أو null بلا بيانات. */
export function percent(part: number, total: number): number | null {
  return total > 0 ? Math.round((part / total) * 100) : null;
}

/**
 * متوسط زمن الجواب بالدقائق: من إنشاء الملف إلى أول جواب له في expert_answers.
 * answers: صف لكل جواب مع تاريخ ملفه. null بلا أجوبة.
 */
export function averageAnswerMinutes(answers: { case_id: string; created_at: string; case_created_at: string }[]): number | null {
  const first = new Map<string, number>();
  for (const a of answers) {
    const ms = Date.parse(a.created_at) - Date.parse(a.case_created_at);
    if (!Number.isFinite(ms) || ms < 0) continue;
    const prev = first.get(a.case_id);
    if (prev === undefined || ms < prev) first.set(a.case_id, ms);
  }
  if (!first.size) return null;
  const total = [...first.values()].reduce((n, ms) => n + ms, 0);
  return Math.round(total / first.size / 60_000);
}

/** «3 ي 4 س» / «4 س 12 د» / «12 د». */
export function formatDuration(minutes: number, units: { d: string; h: string; m: string }): string {
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d) return `${d} ${units.d} ${h} ${units.h}`;
  if (h) return `${h} ${units.h} ${m} ${units.m}`;
  return `${m} ${units.m}`;
}
