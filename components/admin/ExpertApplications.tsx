import "server-only";

import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { localeNames, type Locale } from "@/i18n/locales";
import { ExpertAvatar } from "@/components/experts/ExpertAvatar";
import { avatarUrl, EXPERT_BUCKET, SOCIAL_KEYS, type Socials, type Tazkiya } from "@/lib/experts/types";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { ExpertDecision } from "./ExpertDecision";

/**
 * تبويب «طلبات المختصين» في لوحة المشرف (S9). لا يُرسم إلا بعد requireRole(super_admin | reviewer)
 * في الصفحة، والقراءة بمفتاح service role. الوثائق بروابط موقّعة مدتها 5 دقائق تُنشأ لكل عرض.
 * readOnly (حساب الاطلاع viewer، S10): بلا قبول ورفض، ولا وثائق (لا تُنشأ روابطها أصلاً)،
 * ولا أي وسيلة تواصل (البريد، والهاتف، وبريد التواصل، وتواصل المزكّين).
 */

const SIGNED_URL_SECONDS = 300;
const STATUSES = ["pending", "approved", "rejected"] as const;

type ExpertRow = {
  id: string;
  role: string;
  specialty: string | null;
  country: string | null;
  languages: string[];
  degree: string | null;
  institution: string | null;
  grad_year: number | null;
  traditional: boolean;
  tazkiyat: Tazkiya[];
  doc_paths: string[];
  pledge_at: string | null;
  status: string;
  decided_at: string | null;
  reject_reason: string | null;
  created_at: string;
  bio: string | null;
  avatar_path: string | null;
  contact: { phone?: string; email?: string } | null;
  socials: Socials | null;
  slug: string | null;
  profiles: { display_name: string | null; email: string | null } | null;
};

export async function ExpertApplications({
  base,
  status,
  selected,
  readOnly = false,
}: {
  base: string;
  status: string | undefined;
  selected: string | undefined;
  readOnly?: boolean;
}) {
  const t = await getTranslations("experts.review");
  const tj = await getTranslations("experts.join");
  const tp = await getTranslations("experts.profile");
  const format = await getFormatter();
  const db = createAdminClient();
  const filter = (STATUSES as readonly string[]).includes(status ?? "") ? status! : "pending";
  const date = (v: string | null) => (v ? format.dateTime(new Date(v), { dateStyle: "medium", timeStyle: "short" }) : "—");

  if (selected && /^[0-9a-f-]{36}$/i.test(selected)) {
    const { data: e } = await db
      .from("experts")
      .select("*, profiles!experts_id_fkey(display_name, email)")
      .eq("id", selected)
      .maybeSingle<ExpertRow>();
    if (e) {
      const { data: signed } = e.doc_paths.length && !readOnly
        ? await db.storage.from(EXPERT_BUCKET).createSignedUrls(e.doc_paths, SIGNED_URL_SECONDS)
        : { data: [] };
      const rows: [string, string][] = [
        [t("name"), e.profiles?.display_name ?? "—"],
        ...(readOnly ? [] : [[t("email"), e.profiles?.email ?? "—"] as [string, string]]),
        [t("role"), tj(`roles.${e.role}` as "roles.mufti")],
        [t("specialty"), e.specialty ?? "—"],
        [t("country"), e.country ?? "—"],
        [t("languages"), e.languages.map((l) => localeNames[l as Locale] ?? l).join("، ")],
        [t("traditional"), e.traditional ? t("yes") : t("no")],
        [t("degree"), e.degree ?? "—"],
        [t("institution"), e.institution ?? "—"],
        [t("gradYear"), e.grad_year ? String(e.grad_year) : "—"],
        [t("submittedAt"), date(e.created_at)],
        [t("pledgeAt"), date(e.pledge_at)],
      ];
      if (!readOnly) rows.push([t("phone"), e.contact?.phone || "—"], [t("contactEmail"), e.contact?.email || "—"]);
      if (e.status !== "pending") rows.push([t("decidedAt"), date(e.decided_at)]);
      if (e.reject_reason) rows.push([t("rejectReason"), e.reject_reason]);

      return (
        <div className="space-y-5">
          <Link href={`${base}?tab=experts&status=${filter}`} className="text-sm font-semibold text-green-600 underline underline-offset-4">
            {t("back")}
          </Link>
          <div className="flex items-center gap-4">
            <ExpertAvatar url={avatarUrl(e.avatar_path, SUPABASE_URL)} name={e.profiles?.display_name ?? ""} size={96} />
            <div className="space-y-1">
              <p dir="auto" className="text-lg font-bold text-green-900">
                {e.profiles?.display_name ?? "—"}
              </p>
              {e.status === "approved" && e.slug && (
                <Link href={`/experts/${e.slug}`} className="text-sm font-semibold text-green-600 underline">
                  {t("publicProfile")}
                </Link>
              )}
            </div>
          </div>
          <dl className="divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white">
            {rows.map(([k, v]) => (
              <div key={k} className="grid gap-1 px-3 py-2 sm:grid-cols-3">
                <dt className="text-sm text-ink-600">{k}</dt>
                <dd dir="auto" className="text-sm font-semibold text-green-900 sm:col-span-2">
                  {v}
                </dd>
              </div>
            ))}
          </dl>

          <section>
            <h3 className="mb-1 font-semibold text-green-900">{t("bio")}</h3>
            <p dir="auto" className="whitespace-pre-wrap text-sm text-green-900">
              {e.bio || "—"}
            </p>
          </section>

          <section>
            <h3 className="mb-1 font-semibold text-green-900">{t("socials")}</h3>
            {SOCIAL_KEYS.some((k) => e.socials?.[k]) ? (
              <ul className="space-y-0.5 text-sm">
                {SOCIAL_KEYS.filter((k) => e.socials?.[k]).map((k) => (
                  <li key={k}>
                    <span className="text-ink-600">{tp(`socials.${k}`)}: </span>
                    <a href={e.socials![k]} target="_blank" rel="noopener noreferrer nofollow" dir="ltr" className="break-all text-green-600 underline">
                      {e.socials![k]}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-600">—</p>
            )}
          </section>

          <section>
            <h3 className="mb-1 font-semibold text-green-900">{t("tazkiyat")}</h3>
            {e.tazkiyat.length ? (
              <ul className="list-inside list-disc text-sm text-green-900">
                {e.tazkiyat.map((z, i) => (
                  <li key={i} dir="auto">
                    {readOnly ? z.scholar : `${z.scholar} — ${z.contact}`}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-600">—</p>
            )}
          </section>

          {!readOnly && (
          <section>
            <h3 className="mb-1 font-semibold text-green-900">{t("docs")}</h3>
            <p className="mb-2 text-xs text-ink-600">{t("docsHint")}</p>
            {signed?.length ? (
              <ul className="space-y-1 text-sm">
                {signed.map((s, i) =>
                  s.signedUrl ? (
                    <li key={i}>
                      <a href={s.signedUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-green-600 underline">
                        {t("doc", { n: i + 1 })} ({s.path?.split(".").pop()})
                      </a>
                    </li>
                  ) : null,
                )}
              </ul>
            ) : (
              <p className="text-sm text-ink-600">{t("noDocs")}</p>
            )}
          </section>
          )}

          {e.status === "pending" && !readOnly && <ExpertDecision expertId={e.id} />}
        </div>
      );
    }
  }

  const { data, error } = await db
    .from("experts")
    .select("id, role, specialty, country, status, created_at, profiles!experts_id_fkey(display_name)")
    .eq("status", filter)
    .order("created_at", { ascending: true })
    .limit(200)
    .returns<(Pick<ExpertRow, "id" | "role" | "specialty" | "country" | "status" | "created_at"> & { profiles: { display_name: string | null } | null })[]>();
  if (error) console.error("expert applications:", error.message);

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`${base}?tab=experts&status=${s}`}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${
              s === filter ? "border-green-900 bg-green-900 text-ivory-50" : "border-sand-200 bg-white text-green-900"
            }`}
          >
            {t(`filters.${s}`)}
          </Link>
        ))}
      </nav>
      {!data?.length ? (
        <p className="rounded-xl border border-dashed border-sand-200 bg-white p-4 text-center text-sm text-ink-600">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white">
          {data.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <span dir="auto" className="font-semibold text-green-900">
                {e.profiles?.display_name ?? "—"}
              </span>
              <span className="text-ink-600">
                {tj(`roles.${e.role}` as "roles.mufti")} · {e.specialty} · {e.country}
              </span>
              <span className="ms-auto text-xs text-ink-600">{date(e.created_at)}</span>
              <Link href={`${base}?tab=experts&status=${filter}&app=${e.id}`} className="font-semibold text-green-600 underline">
                {t("open")}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
