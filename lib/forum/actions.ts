"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { locales } from "@/i18n/locales";
import { AuthzError, requireRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { checkForumText, type ForumRejection } from "./guard";
import { canMarkExpertAnswer, FORUM_CATEGORIES, isVerifiedExpert, LIMITS, REPORT_REASONS, spamAllowed } from "./rules";
import { recentPostingTimes, UUID_RE } from "./store";

/**
 * أفعال المشاركين في «الحوار» (R4): موضوع جديد، ورد، وإبلاغ، وتمييز «جواب مختص».
 * لكل فعل في الخادم: (1) حساب مسجّل (requireRole)، (2) التحقق من المدخلات، (3) حارس المنتدى
 * لغير المختص المقبول، (4) حد السبام، ثم الكتابة **بجلسة المستخدم** فتحكمها RLS أيضاً
 * (author_id = auth.uid()، ولا حالة ولا تثبيت، ولا رد في موضوع مقفل)، ومشغّل حد السبام في القاعدة.
 * لا يكتب الخادم في المنتدى نصاً مولّداً أبداً: ما يُنشر هو نص المشارك كما كتبه.
 */

export type ForumError = "unauthorized" | "invalid" | "limited" | "locked" | "duplicate" | "generic";
export type ForumResult<T = object> = ({ ok: true } & T) | { ok: false; error: ForumError } | { ok: false; error: "rejected"; reason: ForumRejection };

const id = z.string().regex(UUID_RE);
const lang = z.enum(locales);

const ThreadInput = z.object({
  title: z.string().trim().min(LIMITS.titleMin).max(LIMITS.titleMax),
  body: z.string().trim().min(LIMITS.threadBodyMin).max(LIMITS.bodyMax),
  category: z.enum(FORUM_CATEGORIES),
  lang,
});

const PostInput = z.object({
  threadId: id,
  body: z.string().trim().min(LIMITS.postBodyMin).max(LIMITS.bodyMax),
  expertAnswer: z.boolean().optional(),
});

const ReportInput = z.object({
  targetType: z.enum(["thread", "post"]),
  targetId: id,
  reason: z.enum(REPORT_REASONS),
  note: z.string().trim().max(LIMITS.noteMax).optional(),
});

function failFrom(error: unknown): { ok: false; error: ForumError } {
  if (error instanceof AuthzError) return { ok: false, error: "unauthorized" };
  console.error("forum action:", error instanceof Error ? error.message : error);
  return { ok: false, error: "generic" };
}

/** خطأ القاعدة إلى رمز للواجهة: حد السبام (المشغّل)، والتكرار، ورفض RLS (موضوع مقفل). */
function dbError(error: { code?: string; message?: string }): ForumError {
  if (error.message?.includes("forum_rate_limited")) return "limited";
  if (error.code === "23505") return "duplicate";
  if (error.code === "42501") return "locked";
  console.error("forum write:", error.message);
  return "generic";
}

async function author() {
  const ctx = await requireRole(["user"]);
  return { ctx, expert: isVerifiedExpert(ctx.expertStatus) };
}

export async function createThread(input: unknown): Promise<ForumResult<{ id: string }>> {
  try {
    const { ctx, expert } = await author();
    const parsed = ThreadInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const { title, body, category, lang } = parsed.data;

    const verdict = checkForumText(`${title}\n${body}`, { expert });
    if (!verdict.ok) return { ok: false, error: "rejected", reason: verdict.reason };
    if (!spamAllowed(await recentPostingTimes(ctx.userId!))) return { ok: false, error: "limited" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("forum_threads")
      .insert({ author_id: ctx.userId, title, body, category, lang, ruling_notice: verdict.rulingNotice })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) return { ok: false, error: error ? dbError(error) : "generic" };
    revalidatePath("/", "layout");
    return { ok: true, id: data.id };
  } catch (error) {
    return failFrom(error);
  }
}

export async function createPost(input: unknown): Promise<ForumResult<{ id: string }>> {
  try {
    const { ctx, expert } = await author();
    const parsed = PostInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const { threadId, body } = parsed.data;

    const verdict = checkForumText(body, { expert });
    if (!verdict.ok) return { ok: false, error: "rejected", reason: verdict.reason };
    if (!spamAllowed(await recentPostingTimes(ctx.userId!))) return { ok: false, error: "limited" };

    const supabase = await createClient();
    const { data: thread } = await supabase.from("forum_threads").select("status").eq("id", threadId).maybeSingle<{ status: string }>();
    if (thread?.status !== "visible") return { ok: false, error: "locked" };

    const { data, error } = await supabase
      .from("forum_posts")
      .insert({
        author_id: ctx.userId,
        thread_id: threadId,
        body,
        // «جواب مختص» للمختص المقبول وحده (وRLS تفحصه ثانية).
        is_expert_answer: expert && Boolean(parsed.data.expertAnswer),
        ruling_notice: verdict.rulingNotice,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) return { ok: false, error: error ? dbError(error) : "generic" };
    revalidatePath("/", "layout");
    return { ok: true, id: data.id };
  } catch (error) {
    return failFrom(error);
  }
}

export async function reportContent(input: unknown): Promise<ForumResult> {
  try {
    const { ctx } = await author();
    const parsed = ReportInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const { targetType, targetId, reason, note } = parsed.data;

    const supabase = await createClient();
    // المحتوى ظاهر للمُبلِّغ (RLS)، وإلا فلا بلاغ.
    const { data: target } = await supabase
      .from(targetType === "thread" ? "forum_threads" : "forum_posts")
      .select("id")
      .eq("id", targetId)
      .maybeSingle();
    if (!target) return { ok: false, error: "invalid" };

    const { error } = await supabase
      .from("forum_reports")
      .insert({ reporter_id: ctx.userId, target_type: targetType, target_id: targetId, reason, note: note || null });
    if (error) return { ok: false, error: dbError(error) };
    return { ok: true };
  } catch (error) {
    return failFrom(error);
  }
}

/** المختص المقبول يميّز رده «جواب مختص» (فيظهر أولاً) أو يلغي التمييز. */
export async function setExpertAnswer(input: unknown): Promise<ForumResult> {
  try {
    const { ctx } = await author();
    const parsed = z.object({ postId: id, value: z.boolean() }).safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };

    const supabase = await createClient();
    const { data: post } = await supabase.from("forum_posts").select("author_id").eq("id", parsed.data.postId).maybeSingle<{ author_id: string | null }>();
    if (!post || !canMarkExpertAnswer(ctx, post.author_id)) return { ok: false, error: "unauthorized" };

    const { data, error } = await supabase
      .from("forum_posts")
      .update({ is_expert_answer: parsed.data.value })
      .eq("id", parsed.data.postId)
      .select("id");
    if (error) return { ok: false, error: dbError(error) };
    if (!data?.length) return { ok: false, error: "unauthorized" };
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return failFrom(error);
  }
}
