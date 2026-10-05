import "server-only";

import { z } from "zod";
import { chatJson, type ChatMessage, type LlmOptions } from "@/lib/llm";
import { CHAPTERS, CLASSIFY_SYSTEM } from "./prompts";

/**
 * المصنّف: لكل رسالة JSON مضبوط بمخطط Zod (عبر chatJson في lib/llm.ts).
 *
 * مخطط النقل (LlmClassificationSchema) كل حقوله مطلوبة، والاختيارية فيه nullable، لأن
 * وضع json_schema الصارم يشترط ذلك. ثم تُحوَّل إلى الشكل العام Classification بحقول اختيارية.
 *
 * aboutMustafti حقل إضافي على مواصفة الخطة (docs/decisions.md، S4): يوجّه أسئلة الهوية
 * والتلاعب التي لم يلتقطها الفحص بالكود في identity.ts.
 */

export const LEVELS = ["A", "B", "C", "D"] as const;
export const USER_TYPES = ["muslim", "new_muslim", "non_muslim", "unknown"] as const;

export const LlmClassificationSchema = z.object({
  lang: z.string().min(2).max(10),
  userType: z.enum(USER_TYPES),
  level: z.enum(LEVELS),
  urgent: z.boolean(),
  outOfScope: z.boolean(),
  aboutMustafti: z.boolean(),
  chapter: z.enum(CHAPTERS).nullable(),
  needsClarification: z.boolean(),
  misconception: z.string().nullable(),
  searchQueries: z.object({
    ar: z.array(z.string()).max(4),
    userLang: z.array(z.string()).max(2),
  }),
});

export type Classification = {
  lang: string;
  userType: (typeof USER_TYPES)[number];
  level: (typeof LEVELS)[number];
  urgent: boolean;
  outOfScope: boolean;
  aboutMustafti: boolean;
  chapter?: (typeof CHAPTERS)[number];
  needsClarification: boolean;
  misconception?: string;
  searchQueries: { ar: string[]; userLang: string[] };
};

export const ClassificationSchema: z.ZodType<Classification> = LlmClassificationSchema.transform((c) => ({
  ...c,
  lang: c.lang.toLowerCase().split(/[-_]/)[0],
  chapter: c.chapter ?? undefined,
  misconception: c.misconception?.trim() || undefined,
  searchQueries: {
    ar: c.searchQueries.ar.map((q) => q.trim()).filter(Boolean),
    userLang: c.searchQueries.userLang.map((q) => q.trim()).filter(Boolean),
  },
})) as unknown as z.ZodType<Classification>;

export type ClassifyResult = {
  classification: Classification;
  latencyMs: number;
  costUsd: number | null;
  mode: "strict" | "repaired" | "fallback";
};

/**
 * يصنّف آخر رسالة. history (اختياري): الرسائل السابقة في المحادثة، لفهم الإلحاح والسياق.
 * المستوى لا يُخفَّض أبداً بالكود: إن كان urgent فهو عاجل، وطلب الحكم الشخصي D.
 */
export async function classify(
  text: string,
  options: LlmOptions & { history?: ChatMessage[] } = {},
): Promise<ClassifyResult> {
  const { history = [], ...llm } = options;
  const messages: ChatMessage[] = [
    { role: "system", content: CLASSIFY_SYSTEM },
    ...history.slice(-6).map((m) => ({ ...m, content: m.content.slice(0, 1500) })),
    { role: "user", content: text.slice(0, 4000) },
  ];
  const parsed = await chatJson(messages, LlmClassificationSchema, {
    temperature: 0,
    schemaName: "classification",
    ...llm,
  });
  const classification = ClassificationSchema.parse(parsed.data);
  return { classification, latencyMs: parsed.latencyMs, costUsd: parsed.usage.costUsd, mode: parsed.mode };
}
