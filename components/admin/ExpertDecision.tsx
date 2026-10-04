"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { decideApplication } from "@/lib/experts/actions";
import { ANSWER_LIMITS } from "@/lib/experts/types";

/** قبول طلب مختص أو رفضه مع سبب. الدور (super_admin أو reviewer) وMFA يُفحصان في الخادم. */
export function ExpertDecision({ expertId }: { expertId: string }) {
  const t = useTranslations("experts.review");
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approved" | "rejected") {
    setBusy(true);
    setError(null);
    const res = await decideApplication({ expertId, decision, reason }).catch(() => ({ ok: false as const, error: "generic" }));
    setBusy(false);
    if (!res.ok) {
      setError(t(`errors.${res.error}` as "errors.generic"));
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => decide("approved")}
        className="rounded-full bg-green-600 px-6 py-2.5 font-semibold text-ivory-50 disabled:opacity-60"
      >
        {t("approve")}
      </button>
      <div className="space-y-2 rounded-xl border border-sand-200 bg-white p-3">
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-green-900">{t("reason")}</span>
          <textarea
            rows={2}
            maxLength={ANSWER_LIMITS.reason}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm text-green-900 outline-none focus:border-green-600"
          />
        </label>
        <button
          type="button"
          disabled={busy || reason.trim().length < 3}
          onClick={() => decide("rejected")}
          className="rounded-full bg-alert-600 px-6 py-2.5 font-semibold text-ivory-50 disabled:opacity-60"
        >
          {t("reject")}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-alert-600">
          {error}
        </p>
      )}
    </div>
  );
}
