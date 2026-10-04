import { z } from "zod";

/**
 * طلب الانضمام كمختص (S9): مخططات المدخلات وحدود الوثائق، مشتركة بين الخادم والمتصفح.
 * الملف نقي (بلا server-only) فيُستورد في المعالج والاختبارات. لا يُوثق بشيء من المتصفح:
 * الخادم يعيد التحقق بهذه المخططات نفسها قبل أي كتابة.
 */

export const EXPERT_ROLES = ["mufti", "daee", "mentor"] as const;
export type ExpertRole = (typeof EXPERT_ROLES)[number];

/** المخزن الخاص وحدوده (تطابق إعداد المخزن في supabase/schema.sql). */
export const EXPERT_BUCKET = "expert-docs";
export const MAX_DOC_BYTES = 10 * 1024 * 1024;
export const MAX_DOCS = 6;
export const DOC_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** هل الملف مقبول (PDF أو صورة، وحتى 10MB)؟ */
export function docProblem(file: { type: string; size: number }): "type" | "size" | null {
  if (!DOC_TYPES[file.type]) return "type";
  if (file.size <= 0 || file.size > MAX_DOC_BYTES) return "size";
  return null;
}

/** مسار الوثيقة في المخزن: {user_id}/{اسم عشوائي}.{امتداد}، ولا شيء غيره. */
export function isOwnDocPath(path: string, userId: string): boolean {
  return new RegExp(`^${userId}/[a-f0-9-]{36}\\.(pdf|jpg|png|webp)$`).test(path);
}

const s = (max: number) => z.string().trim().max(max);

export const TazkiyaSchema = z.object({
  scholar: s(120).min(2),
  contact: s(200).min(3),
});
export type Tazkiya = z.infer<typeof TazkiyaSchema>;

export const ApplicationSchema = z
  .object({
    displayName: s(80).min(2),
    role: z.enum(EXPERT_ROLES),
    specialty: s(160).min(2),
    country: s(80).min(2),
    languages: z.array(s(40).min(2)).min(1).max(12),
    traditional: z.boolean(),
    degree: s(160),
    institution: s(160),
    gradYear: z.number().int().min(1940).max(2100).nullable(),
    tazkiyat: z.array(TazkiyaSchema).max(6),
    docPaths: z.array(s(200)).max(MAX_DOCS),
    pledge: z.literal(true),
  })
  // الدرجة والجهة لمن درس نظامياً، والتزكية لمن درس بالطريقة التقليدية.
  .refine((a) => a.traditional || (a.degree.length >= 2 && a.institution.length >= 2), { path: ["degree"] })
  .refine((a) => !a.traditional || a.tazkiyat.length > 0, { path: ["tazkiyat"] })
  // وثيقة واحدة على الأقل، أو تزكية بوسيلة تواصل.
  .refine((a) => a.docPaths.length > 0 || a.tazkiyat.length > 0, { path: ["docPaths"] });

export type Application = z.infer<typeof ApplicationSchema>;

export const LANGUAGE_OPTIONS = ["ar", "en", "id", "ur", "bn", "tr", "fa", "fr", "ms", "ru", "sw", "ha"] as const;

/** الجواب وملاحظة «ينقص هذا السؤال». */
export const ANSWER_LIMITS = { answer: 8000, note: 1000, reason: 500 } as const;

export const CASE_STATUSES = ["submitted", "assigned", "answered", "closed"] as const;

/** ترتيب لوحة المختص: الأولوية العالية ثم الأقدم. */
export function sortCases<T extends { priority: string | null; created_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const pa = a.priority === "high" ? 0 : 1;
    const pb = b.priority === "high" ? 0 : 1;
    return pa - pb || a.created_at.localeCompare(b.created_at);
  });
}

/** هل يحتاج الجواب ترجمة؟ (لغة السائل غير العربية) */
export function needsTranslation(lang: string | null | undefined): boolean {
  const base = (lang ?? "ar").toLowerCase().split(/[-_]/)[0];
  return base !== "" && base !== "ar";
}
