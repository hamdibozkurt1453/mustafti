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

// ---------------------------------------------------------------------------
// الملف الشخصي: الصورة، والنبذة، والتواصل (للمشرفين فقط)، والحسابات (عامة).
// ---------------------------------------------------------------------------

/** المخزن العام للصور الشخصية وحدوده (تطابق supabase/migrations/20261004_expert_profiles.sql). */
export const AVATAR_BUCKET = "expert-avatars";
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const AVATAR_SIZE = 512;
export const BIO_MAX = 500;
export const BIO_MIN = 20;

/** مسار الصورة: {user_id}/avatar-{رمز}.{jpg|png|webp}، في مجلد صاحبها فقط. */
export function isOwnAvatarPath(path: string, userId: string): boolean {
  return new RegExp(`^${userId}/avatar-[a-z0-9]{6,32}\\.(jpg|png|webp)$`).test(path);
}

/** الرابط العام للصورة (المخزن عام، فلا مفتاح). */
export function avatarUrl(path: string | null | undefined, supabaseUrl: string): string | null {
  if (!path || !supabaseUrl) return null;
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${AVATAR_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export const SOCIAL_KEYS = ["x", "facebook", "instagram", "youtube", "telegram", "linkedin", "website"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];

/** النطاقات المقبولة لكل حساب (website: أي نطاق). */
const SOCIAL_HOSTS: Record<Exclude<SocialKey, "website">, string[]> = {
  x: ["x.com", "twitter.com"],
  facebook: ["facebook.com", "fb.com"],
  instagram: ["instagram.com"],
  youtube: ["youtube.com", "youtu.be"],
  telegram: ["t.me", "telegram.me"],
  linkedin: ["linkedin.com"],
};

/** يتحقق من صيغة الرابط: http(s)، ونطاق المنصة نفسها، ولا شيء غيره. يعيد الرابط الموحّد أو null. */
export function normalizeSocial(key: SocialKey, value: string): string | null {
  const raw = value.trim();
  if (!raw || raw.length > 300) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null;
  if (key !== "website") {
    if (!SOCIAL_HOSTS[key].some((h) => host === h || host.endsWith(`.${h}`))) return null;
    if (url.pathname.replace(/\/+$/, "") === "") return null; // رابط الحساب لا الصفحة الرئيسية للمنصة
  }
  return url.toString();
}

export const SocialsSchema = z
  .partialRecord(z.enum(SOCIAL_KEYS), z.string().trim().max(300))
  .transform((obj, ctx) => {
    const out: Partial<Record<SocialKey, string>> = {};
    for (const key of SOCIAL_KEYS) {
      const value = obj[key];
      if (!value) continue;
      const url = normalizeSocial(key, value);
      if (!url) ctx.addIssue({ code: "custom", path: [key], message: "url" });
      else out[key] = url;
    }
    return out;
  });
export type Socials = Partial<Record<SocialKey, string>>;

export const PHONE_RE = /^\+?[0-9][0-9 ()-]{5,22}$/;

export const ContactSchema = z.object({
  phone: z.union([z.literal(""), z.string().trim().regex(PHONE_RE)]).default(""),
  email: z.union([z.literal(""), z.email().max(200)]).default(""),
});
export type Contact = z.infer<typeof ContactSchema>;

/** ما يعدّله المختص المقبول في ملفه (الاسم والدور والتخصص تبقى كما راجعها المشرف). */
export const ProfileEditSchema = z.object({
  bio: s(BIO_MAX).min(BIO_MIN),
  avatarPath: s(200).nullable(),
  contact: ContactSchema,
  socials: SocialsSchema,
});

/**
 * رابط الملف العام: الاسم بحروف لاتينية إن وُجدت، ثم لاحقة عشوائية (لا يتكرر، ولا يكون «join»).
 * random: 6 أحرف [a-z0-9] تُعطى من الخادم.
 */
export function makeSlug(name: string, random: string): string {
  const latin = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return `${latin.length >= 3 ? latin : "expert"}-${random}`;
}

export const ApplicationSchema = z
  .object({
    bio: s(BIO_MAX).min(BIO_MIN),
    avatarPath: s(200).nullable().default(null),
    contact: ContactSchema.default({ phone: "", email: "" }),
    socials: SocialsSchema.default({}),
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
