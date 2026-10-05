import "server-only";

import { AuthzError, getAuthContext, type AuthContext } from "@/lib/auth/roles";
import type { CaseTrack } from "@/lib/brain/modes";
import { missingColumn } from "@/lib/case/store";
import type { CaseRow, CaseUnknown } from "@/lib/case/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { avatarUrl, sortCases, type Contact, type ExpertRole, type Socials } from "./types";

/**
 * قراءات المختصين (S9)، كلها في الخادم بمفتاح service role بعد فحص الدور في الكود.
 * لا يُقرأ هنا أبداً ما يدل على هوية السائل: لا owner_id ولا contact_email ولا الرمز السري
 * ولا المحادثة الخام (case_messages). المختص يرى الملف المرتب فقط.
 */

export type ExpertSelf = { id: string; role: ExpertRole; countryCode: string | null; ctx: AuthContext };

/**
 * المختص المقبول للطلب الحالي، أو AuthzError.
 * يُقرأ الصف من القاعدة في كل طلب (لا من الجلسة)، فسحب القبول يسري فوراً.
 */
export async function requireApprovedExpert(): Promise<ExpertSelf> {
  const ctx = await getAuthContext();
  if (!ctx.userId) throw new AuthzError(401);
  const { data } = await createAdminClient()
    .from("experts")
    .select("role, status, country_code")
    .eq("id", ctx.userId)
    .maybeSingle<{ role: ExpertRole; status: string; country_code: string | null }>();
  if (data?.status !== "approved") throw new AuthzError(403);
  return { id: ctx.userId, role: data.role, countryCode: data.country_code, ctx };
}

export type QueueCase = {
  id: string;
  chapter: string | null;
  priority: string | null;
  status: string;
  lang: string | null;
  created_at: string;
  mine: boolean;
  /** السائل من بلد المختص (مقارنة في الخادم؛ رمز بلد السائل نفسه لا يصل إلى الواجهة). */
  fromMyCountry: boolean;
  summary: string;
  /** R3: مسار المسألة (general، new_muslim، discover). */
  track: CaseTrack;
};

/**
 * تبويب «المسائل»: المحالة إلى دوره وتنتظر (submitted بلا مختص)، أو المسندة إليه ولم يُجب عنها.
 * المجاب عنها في «الأرشيف». الترتيب: بلد المختص أولاً ثم الأحدث (sortCases).
 * R3: الدور يحدد المسار عملياً (mentor ← new_muslim، daee ← discover، والاحتياط إلى mufti)،
 * ويُعرض المسار على كل مسألة مع فلتر له.
 */
export async function expertQueue(
  self: ExpertSelf,
  filter: { chapter?: string; status?: string; track?: CaseTrack },
): Promise<QueueCase[]> {
  const db = createAdminClient();
  const query = (withTrack: boolean) => {
    let q = db
      .from("cases")
      .select(`id, chapter, priority, status, lang, created_at, assigned_expert, asker_country, ${withTrack ? "track, " : ""}case_files(summary_ar)`)
      .or(
        `and(route_to.eq.${self.role},status.eq.submitted,assigned_expert.is.null),and(assigned_expert.eq.${self.id},status.eq.assigned)`,
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (filter.chapter) q = q.eq("chapter", filter.chapter);
    if (filter.status) q = q.eq("status", filter.status);
    if (withTrack && filter.track) q = q.eq("track", filter.track);
    return q.returns<
    {
      id: string;
      chapter: string | null;
      priority: string | null;
      status: string;
      lang: string | null;
      created_at: string;
      assigned_expert: string | null;
      asker_country: string | null;
      track?: CaseTrack | null;
      case_files: { summary_ar: string | null }[];
    }[]
    >();
  };
  let { data, error } = await query(true);
  // قبل migration المسار (20261009_case_track.sql): القائمة بلا المسار (وفلتره يُعطي العام وحده).
  if (error && missingColumn(error, "track")) {
    ({ data, error } = await query(false));
    if (filter.track && filter.track !== "general") data = [];
  }
  if (error) console.error("expert queue:", error.message);
  return sortCases(
    (data ?? []).map((c) => ({
      id: c.id,
      chapter: c.chapter,
      priority: c.priority,
      status: c.status,
      lang: c.lang,
      created_at: c.created_at,
      mine: c.assigned_expert === self.id,
      fromMyCountry: Boolean(self.countryCode && c.asker_country && c.asker_country === self.countryCode),
      summary: c.case_files[0]?.summary_ar ?? "",
      track: c.track ?? "general",
    })),
  );
}

export type ArchiveCase = {
  id: string;
  chapter: string | null;
  createdAt: string;
  answeredAt: string;
  summaryAr: string;
  rows: CaseRow[];
  answerAr: string;
};

/**
 * «الأرشيف»: المسائل التي أجاب عنها المختص نفسه، بالأحدث جواباً.
 * بلا أي بيانات للسائل: لا لغة ولا بلد ولا بريد ولا حساب، والملف المرتب وجوابه فقط.
 */
export async function expertArchive(self: ExpertSelf, filter: { chapter?: string } = {}, limit = 200): Promise<ArchiveCase[]> {
  const { data, error } = await createAdminClient()
    .from("expert_answers")
    .select("answer_ar, created_at, cases!inner(id, chapter, created_at, case_files(summary_ar, pillars, created_at))")
    .eq("expert_id", self.id)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<
      {
        answer_ar: string;
        created_at: string;
        cases: {
          id: string;
          chapter: string | null;
          created_at: string;
          case_files: { summary_ar: string | null; pillars: { rows?: CaseRow[] } | null; created_at: string }[];
        };
      }[]
    >();
  if (error) console.error("expert archive:", error.message);
  return (data ?? [])
    .filter((a) => !filter.chapter || a.cases.chapter === filter.chapter)
    .map((a) => {
      const file = [...a.cases.case_files].sort((x, y) => y.created_at.localeCompare(x.created_at))[0];
      return {
        id: a.cases.id,
        chapter: a.cases.chapter,
        createdAt: a.cases.created_at,
        answeredAt: a.created_at,
        summaryAr: file?.summary_ar ?? "",
        rows: file?.pillars?.rows ?? [],
        answerAr: a.answer_ar,
      };
    });
}

export type ExpertCase = {
  id: string;
  /** R3: ملاحظة التوجيه عند الاحتياط إلى المفتي (لا مرشد أو داعية معتمد). */
  routingNote?: string;
  chapter: string | null;
  priority: string | null;
  status: string;
  lang: string | null;
  createdAt: string;
  mine: boolean;
  question: string;
  summaryAr: string;
  rows: CaseRow[];
  unknowns: CaseUnknown[];
  answer: { answerAr: string; answerTranslated: string | null } | null;
  missing: { note: string; createdAt: string }[];
};

/**
 * ملف واحد للمختص، أو null إن لم يكن من حقه:
 * يراه إن كان محالاً إلى دوره وينتظر بلا مختص، أو مسنداً إليه هو.
 */
export async function expertCase(self: ExpertSelf, caseId: string): Promise<ExpertCase | null> {
  if (!/^[0-9a-f-]{36}$/i.test(caseId)) return null;
  const db = createAdminClient();
  const { data: c } = await db
    .from("cases")
    .select("id, chapter, priority, status, lang, created_at, route_to, assigned_expert")
    .eq("id", caseId)
    .maybeSingle();
  if (!c) return null;
  const mine = c.assigned_expert === self.id;
  const open = c.route_to === self.role && c.status === "submitted" && !c.assigned_expert;
  if (!mine && !open) return null;

  const [{ data: file }, { data: answer }, { data: missing }] = await Promise.all([
    db
      .from("case_files")
      .select("pillars, summary_ar, unknowns")
      .eq("case_id", c.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{
        pillars: { question?: string; rows?: CaseRow[]; routing?: { note?: string } } | null;
        summary_ar: string | null;
        unknowns: CaseUnknown[] | null;
      }>(),
    mine
      ? db.from("expert_answers").select("answer_ar, answer_translated").eq("case_id", c.id).eq("expert_id", self.id).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("feedback_missing").select("note, created_at").eq("case_id", c.id).eq("expert_id", self.id).order("created_at"),
  ]);

  return {
    id: c.id,
    chapter: c.chapter,
    priority: c.priority,
    status: c.status,
    lang: c.lang,
    createdAt: c.created_at,
    mine,
    ...(file?.pillars?.routing?.note ? { routingNote: file.pillars.routing.note } : {}),
    question: file?.pillars?.question ?? "",
    summaryAr: file?.summary_ar ?? "",
    rows: file?.pillars?.rows ?? [],
    unknowns: file?.unknowns ?? [],
    answer: answer ? { answerAr: answer.answer_ar, answerTranslated: answer.answer_translated } : null,
    missing: (missing ?? []).map((m) => ({ note: m.note, createdAt: m.created_at })),
  };
}

/** يسجّل قرار المشرف في admin_audit (إن تعذّر لا يُفشل القرار، ويُسجَّل الخطأ). */
export async function audit(adminId: string, action: string, target: string, details: Record<string, unknown> = {}) {
  const { error } = await createAdminClient().from("admin_audit").insert({ admin_id: adminId, action, target, details });
  if (error) console.error("admin_audit:", error.message);
}

// ---------------------------------------------------------------------------
// الملف الشخصي والبطاقة العامة (تغيير القرار: السائل يرى بطاقة المختص الذي أجابه، لا العكس).
// contact (الهاتف والبريد) لا يُقرأ هنا أبداً: للمشرفين في مراجعة الطلب فقط.
// ---------------------------------------------------------------------------

export type PublicExpert = {
  id: string;
  countryCode: string | null;
  slug: string;
  name: string;
  role: ExpertRole;
  specialty: string | null;
  country: string | null;
  languages: string[];
  bio: string | null;
  avatarUrl: string | null;
  socials: Socials;
  answered: number;
};

type PublicRow = {
  id: string;
  country_code: string | null;
  slug: string | null;
  role: ExpertRole;
  specialty: string | null;
  country: string | null;
  languages: string[] | null;
  bio: string | null;
  avatar_path: string | null;
  socials: Socials | null;
  profiles: { display_name: string | null } | null;
};

const PUBLIC_COLUMNS =
  "id, slug, role, specialty, country, country_code, languages, bio, avatar_path, socials, profiles!experts_id_fkey(display_name)";

/** عدد المسائل التي أجاب عنها المختص (عدد فقط، بلا أي مسألة). */
export async function answeredCount(expertId: string): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("expert_answers")
    .select("id", { count: "exact", head: true })
    .eq("expert_id", expertId);
  if (error) console.error("answered count:", error.message);
  return count ?? 0;
}

function toPublic(row: PublicRow, answered: number): PublicExpert {
  return {
    id: row.id,
    countryCode: row.country_code,
    slug: row.slug ?? "",
    name: row.profiles?.display_name ?? "",
    role: row.role,
    specialty: row.specialty,
    country: row.country,
    languages: row.languages ?? [],
    bio: row.bio,
    avatarUrl: avatarUrl(row.avatar_path, SUPABASE_URL),
    socials: row.socials ?? {},
    answered,
  };
}

/** الملف العام بالرابط، للمقبولين فقط (وإلا null). */
export async function publicExpertBySlug(slug: string): Promise<PublicExpert | null> {
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(slug)) return null;
  const { data, error } = await createAdminClient()
    .from("experts")
    .select(PUBLIC_COLUMNS)
    .eq("slug", slug)
    .eq("status", "approved")
    .maybeSingle<PublicRow>();
  if (error) console.error("public expert:", error.message);
  if (!data) return null;
  return toPublic(data, await answeredCount(data.id));
}

/** ملف المختص المقبول نفسه (لصفحة «ملفي الشخصي»)، مع التواصل لأنه صاحبه. */
export async function ownExpertProfile(
  expertId: string,
): Promise<(PublicExpert & { avatarPath: string | null; contact: Contact }) | null> {
  const { data, error } = await createAdminClient()
    .from("experts")
    .select(`${PUBLIC_COLUMNS}, contact`)
    .eq("id", expertId)
    .maybeSingle<PublicRow & { contact: Contact | null }>();
  if (error) console.error("own expert profile:", error.message);
  if (!data) return null;
  return {
    ...toPublic(data, await answeredCount(data.id)),
    avatarPath: data.avatar_path,
    contact: { phone: data.contact?.phone ?? "", email: data.contact?.email ?? "" },
  };
}

export type AnswerCard = { name: string; specialty: string | null; avatarUrl: string | null; slug: string };

/** بطاقات «أجاب عن مسألتك» لمعرّفات المختصين، للمقبولين فقط. */
export async function answerCards(expertIds: string[]): Promise<Map<string, AnswerCard>> {
  const ids = [...new Set(expertIds)].filter(Boolean);
  const out = new Map<string, AnswerCard>();
  if (!ids.length) return out;
  const { data, error } = await createAdminClient()
    .from("experts")
    .select("id, slug, specialty, avatar_path, profiles!experts_id_fkey(display_name)")
    .in("id", ids)
    .eq("status", "approved")
    .returns<{ id: string; slug: string | null; specialty: string | null; avatar_path: string | null; profiles: { display_name: string | null } | null }[]>();
  if (error) console.error("answer cards:", error.message);
  for (const e of data ?? []) {
    if (!e.slug) continue;
    out.set(e.id, {
      name: e.profiles?.display_name ?? "",
      specialty: e.specialty,
      avatarUrl: avatarUrl(e.avatar_path, SUPABASE_URL),
      slug: e.slug,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// إشعارات داخل الموقع: أعداد فقط، تُحسب في الخادم.
// ---------------------------------------------------------------------------

/** الطلبات المعلّقة (لـ super_admin وreviewer). */
export async function pendingApplicationsCount(): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("experts")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) console.error("pending applications count:", error.message);
  return count ?? 0;
}

/** الملفات المتاحة لدور المختص: محالة إليه، تنتظر، ولم يتولّها أحد. */
export async function availableCasesCount(role: ExpertRole): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("cases")
    .select("id", { count: "exact", head: true })
    .eq("route_to", role)
    .eq("status", "submitted")
    .is("assigned_expert", null);
  if (error) console.error("available cases count:", error.message);
  return count ?? 0;
}
