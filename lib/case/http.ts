import "server-only";

import { z } from "zod";
import { authzResponse, requireRole, type AuthContext } from "@/lib/auth/roles";
import { CHAPTERS } from "@/lib/brain/prompts";
import { checkRateLimit } from "@/lib/rate-limit";
import { CASE_LIMITS } from "./types";

/**
 * مشترك بين مسارات /api/case/*: فحص الدور (الزائر مسموح)، ورفض الطلبات من مواقع أخرى،
 * وحد الطلبات لكل IP، ومخططات Zod للمدخلات (لا يُوثق بشيء من المتصفح).
 */

export async function guardCaseRequest(
  request: Request,
  scope: "case" | "case-submit",
  limit: number,
): Promise<{ ctx: AuthContext } | { response: Response }> {
  let ctx: AuthContext;
  try {
    ctx = await requireRole(["visitor"]);
  } catch (error) {
    const res = authzResponse(error);
    if (res) return { response: res };
    throw error;
  }
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return { response: Response.json({ error: "forbidden" }, { status: 403 }) };
  }
  const rl = await checkRateLimit(scope, request.headers, limit, 3600);
  if (!rl.ok) {
    return {
      response: Response.json(
        { error: rl.reason === "limited" ? "rate_limited" : "unavailable" },
        { status: rl.reason === "limited" ? 429 : 503, headers: { "Retry-After": "3600" } },
      ),
    };
  }
  return { ctx };
}

const s = (max: number) => z.string().trim().max(max);

export const KindSchema = z.enum(["personal", "ruling"]);
export const ChapterSchema = z.enum(CHAPTERS);
export const LangSchema = z.string().trim().min(2).max(10).regex(/^[a-zA-Z_-]+$/);

export const PlanSchema = z.object({
  chapter: ChapterSchema,
  lang: LangSchema,
  known: z
    .array(z.object({ key: s(40), text: s(400), textAr: s(400), value: s(400), option: s(60).optional() }))
    .max(20),
  questions: z
    .array(
      z.object({
        key: s(40),
        text: s(400),
        textAr: s(400),
        why: s(400).default(""),
        whyAr: s(400).default(""),
        type: z.enum(["choice", "number", "text", "yesno"]),
        options: z.array(z.object({ value: s(60), label: s(200) })).max(8),
        required: z.boolean(),
        generated: z.boolean().optional(),
        showIf: z
          .object({ key: s(40), in: z.array(s(60)).max(12).optional(), notIn: z.array(s(60)).max(12).optional() })
          .optional(),
      }),
    )
    .max(CASE_LIMITS.planQuestions),
});

export const AnswersSchema = z.array(z.object({ key: s(40), value: s(CASE_LIMITS.value).nullable() })).max(CASE_LIMITS.planQuestions);

export const DraftSchema = z.object({
  question: s(CASE_LIMITS.question).min(1),
  summaryAr: s(CASE_LIMITS.summary),
  summaryUser: s(CASE_LIMITS.summary).min(1),
  rows: z
    .array(
      z.object({
        key: s(40),
        labelAr: s(400),
        label: s(400),
        valueAr: s(CASE_LIMITS.value),
        value: s(CASE_LIMITS.value),
        generated: z.boolean().optional(),
        source: z.enum(["question", "answer"]),
      }),
    )
    .max(24),
  unknowns: z.array(z.object({ key: s(40), labelAr: s(400), label: s(400) })).max(24),
});

export const QuestionSchema = s(CASE_LIMITS.question).min(1);
