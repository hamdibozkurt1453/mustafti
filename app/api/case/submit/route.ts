import { z } from "zod";
import { redactDraft } from "@/lib/case/draft";
import { translateEdits } from "@/lib/case/file";
import { ChapterSchema, DraftSchema, guardCaseRequest, KindSchema, LangSchema } from "@/lib/case/http";
import { saveCase } from "@/lib/case/store";
import { isAdminClientConfigured } from "@/lib/supabase/admin";

/**
 * POST /api/case/submit — «أوافق وأرسل»: الملف كما عدّله السائل، بعد حذف الهوية بالأنماط ثانيةً
 * (قد يضيف السائل اسمه أثناء التعديل)، وترجمة ما عدّله بلغته إلى العربية للمفتي.
 * يُحفظ في cases وcase_files، ويُعاد الرمز السري مرة واحدة لرابط /case/[الرمز].
 * إن كان السائل مسجّلاً يُربط الملف بحسابه (owner_id) فيظهر في /me.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  lang: LangSchema,
  chapter: ChapterSchema,
  userType: z.string().max(20).nullish(),
  kind: KindSchema,
  draft: DraftSchema,
  edited: z.object({ summary: z.boolean(), rows: z.array(z.string().max(40)).max(24) }),
  email: z.union([z.literal(""), z.email().max(200)]).nullish(),
});

export async function POST(request: Request) {
  const gate = await guardCaseRequest(request, "case-submit", 10);
  if ("response" in gate) return gate.response;
  if (!isAdminClientConfigured()) return Response.json({ error: "unavailable" }, { status: 503 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const emailBad = parsed.error.issues.some((i) => i.path[0] === "email");
    return Response.json({ error: emailBad ? "bad_email" : "bad_request" }, { status: 400 });
  }
  const { lang, chapter, userType, kind, edited, email } = parsed.data;
  const lang2 = lang.toLowerCase().split(/[-_]/)[0];
  const draft = await translateEdits(redactDraft(parsed.data.draft), lang2, edited);

  try {
    const saved = await saveCase({
      draft: redactDraft(draft),
      lang: lang2,
      chapter,
      userType,
      kind,
      email: email ? email.toLowerCase() : null,
      ownerId: gate.ctx.userId,
    });
    return Response.json({ token: saved.token, routeTo: saved.routeTo, linked: Boolean(gate.ctx.userId) });
  } catch (error) {
    console.error("case submit:", (error as Error)?.message ?? error);
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
