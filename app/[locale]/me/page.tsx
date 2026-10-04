import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { placeholderMetadata } from "@/components/PagePlaceholder";
import type { Locale } from "@/i18n/locales";
import { signOut } from "@/lib/auth/actions";
import { getAuthContext, roleSatisfies } from "@/lib/auth/roles";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return { ...(await placeholderMetadata(locale, "me")), robots: { index: false } };
}

/** `/me` — حساب المستخدم المسجّل (سجل الأسئلة والملفات يُضاف في S8). */
export default async function MePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale); // اللغة متحقق منها في layout

  const ctx = await getAuthContext();
  if (!roleSatisfies(ctx.role, ["user"])) {
    redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/me`)}`);
  }

  const t = await getTranslations();
  const pages = await getTranslations("pages");
  return (
    <AuthShell title={t("auth.account")} lead={pages("me.description")}>
      <dl className="space-y-3 text-green-900">
        <div>
          <dt className="text-sm text-ink-600">{t("auth.signedInAs")}</dt>
          <dd className="font-semibold" dir="ltr">{ctx.email}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink-600">{t("auth.roleLabel")}</dt>
          <dd className="font-semibold">{t(`auth.roles.${ctx.role}`)}</dd>
        </div>
      </dl>
      <p className="mt-6 rounded-xl border border-dashed border-sand-200 bg-white p-4 text-center text-sm text-ink-600">
        {pages("underConstruction")}
      </p>
      <form action={signOut} className="mt-6">
        <input type="hidden" name="locale" value={locale} />
        <button
          type="submit"
          className="w-full rounded-full border border-green-900/20 px-5 py-3 font-semibold text-green-900 transition hover:bg-green-900/5"
        >
          {t("auth.signOut")}
        </button>
      </form>
    </AuthShell>
  );
}
