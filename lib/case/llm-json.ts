import "server-only";

import { z } from "zod";
import { chat, LlmError, type ChatMessage } from "@/lib/llm";
import { parseFirstJson } from "./json";

/**
 * طلب JSON متين للاستيضاح، مع سجل كامل للتشخيص (/api/admin/case-test):
 * 1) طلب نصي عادي والمخطط في التعليمات (لا وضع json_schema الصارم الذي يرفضه بعض المزوّدين).
 * 2) استخراج أول JSON صالح يطابق مخطط Zod.
 * 3) إن فشل: إعادة الطلب مرة واحدة مع رسالة الخطأ. (بلا إعادة تلقائية عند المهلة: جولة التوليد الثانية هي الإعادة،
 *    فأسوأ زمن للتوليد نحو 40 ثانية.)
 */

export type JsonAttempt = { raw: string; ms: number; error?: string };

export type JsonCallResult<T> = { ok: true; data: T; attempts: JsonAttempt[] } | { ok: false; error: string; attempts: JsonAttempt[] };

export async function jsonCall<T>(
  messages: ChatMessage[],
  schema: z.ZodType<T>,
  opts: { timeoutMs: number; maxTokens: number; temperature?: number },
): Promise<JsonCallResult<T>> {
  let shape = "";
  try {
    // شكل المدخل (قبل التحويلات) ولا يرمي لما لا يمثله JSON Schema.
    shape = JSON.stringify(z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }));
  } catch {
    shape = "(see the example in the instructions)";
  }
  const withShape: ChatMessage[] = [
    ...messages,
    { role: "system", content: `Reply with ONE JSON object only (no prose, no markdown), matching this JSON Schema:\n${shape}` },
  ];
  const attempts: JsonAttempt[] = [];
  const llm = { timeoutMs: opts.timeoutMs, maxTokens: opts.maxTokens, temperature: opts.temperature ?? 0, retries: 0 };

  let raw = "";
  for (let round = 0; round < 2; round++) {
    const convo: ChatMessage[] =
      round === 0
        ? withShape
        : [
            ...withShape,
            { role: "assistant", content: raw.slice(0, 6000) },
            {
              role: "user",
              content: `Your previous reply was not valid (${attempts[attempts.length - 1].error}). Reply again with the corrected JSON object only.`,
            },
          ];
    const started = Date.now();
    try {
      const res = await chat(convo, llm);
      raw = res.text;
    } catch (error) {
      const msg = error instanceof LlmError ? `${error.code}${error.detail ? `: ${error.detail.slice(0, 200)}` : ""}` : String(error);
      attempts.push({ raw: "", ms: Date.now() - started, error: `request failed: ${msg}` });
      // انقطاع الطلب نفسه (مهلة أو حد يومي): لا فائدة من طلب «التصحيح».
      return { ok: false, error: attempts[attempts.length - 1].error!, attempts };
    }
    const parsed = parseFirstJson(raw, schema);
    attempts.push({ raw, ms: Date.now() - started, ...(parsed.ok ? {} : { error: parsed.error }) });
    if (parsed.ok) return { ok: true, data: parsed.data, attempts };
  }
  return { ok: false, error: attempts[attempts.length - 1].error ?? "invalid", attempts };
}
