"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { closeCase, reassignCase } from "@/lib/admin/actions";

/**
 * «إعادة التوجيه» و«إغلاق» لملف واحد. لا يُرسم لحساب الاطلاع (viewer)،
 * والدور يُفحص ثانية في الخادم لكل فعل.
 */
export function CaseActions({ caseId, reassign, close }: { caseId: string; reassign: boolean; close: boolean }) {
  const t = useTranslations("admin.cases");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: "reassign" | "close") {
    if (!window.confirm(t(kind === "reassign" ? "confirmReassign" : "confirmClose"))) return;
    setBusy(true);
    setError(null);
    const fn = kind === "reassign" ? reassignCase : closeCase;
    const res = await fn({ caseId }).catch(() => ({ ok: false as const, error: "generic" as const }));
    setBusy(false);
    if (!res.ok) {
      setError(t(`errors.${res.error}`));
      return;
    }
    router.refresh();
  }

  if (!reassign && !close) return null;
  const btn = "rounded-full border px-3 py-1 text-xs font-semibold transition disabled:opacity-60";
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {reassign && (
        <button type="button" disabled={busy} onClick={() => act("reassign")} className={`${btn} border-green-600/40 text-green-900 hover:bg-green-600 hover:text-ivory-50`}>
          {t("reassign")}
        </button>
      )}
      {close && (
        <button type="button" disabled={busy} onClick={() => act("close")} className={`${btn} border-alert-600/40 text-alert-600 hover:bg-alert-600 hover:text-ivory-50`}>
          {t("close")}
        </button>
      )}
      {error && (
        <span role="alert" className="text-xs text-alert-600">
          {error}
        </span>
      )}
    </span>
  );
}
