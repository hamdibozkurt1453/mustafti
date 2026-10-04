import { z } from "zod";
import { buildDraft } from "@/lib/case/file";
import { AnswersSchema, guardCaseRequest, PlanSchema, QuestionSchema } from "@/lib/case/http";

/**
 * POST /api/case/draft — ملف المسألة بعد الاستيضاح: الملخص بالعربية وبلغة السائل، وجدول الأركان،
 * و«ما لم يُعرف»، بعد حذف الهوية (النموذج ثم الأنماط). لا يُحفظ شيء هنا: السائل يراجع أولاً.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ question: QuestionSchema, plan: PlanSchema, answers: AnswersSchema });

export async function POST(request: Request) {
  const gate = await guardCaseRequest(request, "case", 40);
  if ("response" in gate) return gate.response;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const { question, plan, answers } = parsed.data;
  const draft = await buildDraft(question, plan, answers);
  return Response.json({ draft });
}
