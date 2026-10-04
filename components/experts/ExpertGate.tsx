import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { Link } from "@/i18n/navigation";

/** ما يراه غير المقبول عند فتح /expert: حالة طلبه، أو دعوة للتقديم. */
export async function ExpertGate({ status }: { status: "pending" | "approved" | "rejected" | null }) {
  const t = await getTranslations("experts");
  if (status === "pending") return <AuthShell title={t("dashboard.pendingTitle")} lead={t("dashboard.pendingLead")}>{null}</AuthShell>;
  return (
    <AuthShell title={t("dashboardLink")} lead={t("dashboard.noApplication")}>
      <Link href="/experts/join" className="inline-block rounded-full bg-gold-500 px-5 py-3 font-semibold text-green-900">
        {status === "rejected" ? t("join.rejectedTitle") : t("dashboard.joinCta")}
      </Link>
    </AuthShell>
  );
}
