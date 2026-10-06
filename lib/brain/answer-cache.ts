import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";
import { matchKey } from "./guard";
import type { ChatMode } from "./modes";

/**
 * ذاكرة الأجوبة الدائمة (R5): جدول answer_cache في Supabase (migration 20261010_answer_cache.sql)،
 * المفتاح: السؤال موحَّداً (matchKey) والوضع واللغة ونسخة العقل، لمدة 7 أيام. السؤال المكرر يُجاب
 * فوراً من أي نسخة خادم. القراءة والكتابة بمفتاح الخادم وحده (RLS بلا سياسات).
 *
 * لا يُخزَّن إلا الجواب (kind = answer) بلا سياق محادثة سابق (respond.ts). وأي خطأ (الجدول غير
 * موجود بعد، أو انقطاع) يُتجاهل: الذاكرة تسريع لا شرط.
 */

/** تتغير مع كل تغيير في الصياغة أو الشخصيات، فلا يُعاد جواب كُتب بقواعد قديمة. */
export const ANSWER_CACHE_VERSION = "r5c";
export const ANSWER_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** القراءة لا تؤخر الجواب: ما تأخر عن هذا يُعدّ غياباً. */
const READ_TIMEOUT_MS = 1_500;

/** السؤال موحَّداً للمفتاح: بلا تشكيل ولا علامات ولا فروق همزات، وبحد 400 حرف. */
export function normalizeQuestion(question: string): string {
  return matchKey(question).slice(0, 400);
}

/** مفتاح الصف: sha256 للنسخة والوضع واللغة والسؤال الموحَّد. */
export function answerCacheKey(question: string, mode: ChatMode, lang: string): string {
  return createHash("sha256").update(`${ANSWER_CACHE_VERSION}|${mode}|${lang}|${normalizeQuestion(question)}`).digest("hex");
}

export async function readAnswerCache<T>(question: string, mode: ChatMode, lang: string): Promise<T | null> {
  if (!isAdminClientConfigured()) return null;
  const read = (async () => {
    const { data, error } = await createAdminClient()
      .from("answer_cache")
      .select("reply, expires_at")
      .eq("key", answerCacheKey(question, mode, lang))
      .maybeSingle();
    if (error || !data) return null;
    if (new Date(data.expires_at as string).getTime() < Date.now()) return null;
    return data.reply as T;
  })().catch(() => null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((r) => (timer = setTimeout(() => r(null), READ_TIMEOUT_MS)));
  return Promise.race([read, timeout]).finally(() => clearTimeout(timer));
}

export async function writeAnswerCache(question: string, mode: ChatMode, lang: string, reply: unknown): Promise<void> {
  if (!isAdminClientConfigured()) return;
  try {
    const { error } = await createAdminClient()
      .from("answer_cache")
      .upsert(
        {
          key: answerCacheKey(question, mode, lang),
          question_norm: normalizeQuestion(question),
          mode,
          lang: lang.slice(0, 10),
          version: ANSWER_CACHE_VERSION,
          reply,
          expires_at: new Date(Date.now() + ANSWER_CACHE_TTL_MS).toISOString(),
        },
        { onConflict: "key" },
      );
    if (error) console.warn("answer_cache:", error.message);
  } catch (error) {
    console.warn("answer_cache:", (error as Error)?.message ?? error);
  }
}
