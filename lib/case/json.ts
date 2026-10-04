import type { z } from "zod";

/**
 * استخراج أول كائن JSON صالح من نص النموذج (بعد ```json أو كلام قبله أو بعده)، والتحقق منه
 * بمخطط Zod. يمر على كل كائن متوازن الأقواس بالترتيب (مع احترام النصوص بين علامات التنصيص)،
 * ويعيد أول ما يطابق المخطط، أو آخر خطأ. الملف نقي ليُختبر: tests/case.test.ts.
 */

/** كل المقاطع {…} المتوازنة في النص، بالترتيب. */
export function jsonCandidates(text: string): string[] {
  const out: string[] = [];
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        out.push(text.slice(start, i + 1));
        break;
      }
    }
    if (out.length >= 12) break;
  }
  return out;
}

export function parseFirstJson<T>(text: string, schema: z.ZodType<T>): { ok: true; data: T } | { ok: false; error: string } {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  let error = "no JSON object found";
  for (const candidate of jsonCandidates(cleaned)) {
    let raw: unknown;
    try {
      raw = JSON.parse(candidate);
    } catch (e) {
      error = `invalid JSON: ${(e as Error).message}`;
      continue;
    }
    const result = schema.safeParse(raw);
    if (result.success) return { ok: true, data: result.data };
    error = result.error.issues
      .slice(0, 6)
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
  }
  return { ok: false, error: error.slice(0, 400) };
}
