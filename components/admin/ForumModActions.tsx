"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { moderateForum, resolveForumReports, type ModResult } from "@/lib/forum/admin-actions";
import type { ForumTarget, ModAction } from "@/lib/forum/rules";

/**
 * أزرار الإشراف على موضوع أو رد (R4): الأفعال المتاحة لحالته، و«حل البلاغ» إن كان عليه بلاغ مفتوح.
 * لا تُرسم لحساب الاطلاع (viewer)، والدور يُفحص ثانية في الخادم لكل فعل.
 */
export function ForumModActions({
  targetType,
  targetId,
  actions,
  reported = false,
}: {
  targetType: ForumTarget;
  targetId: string;
  actions: ModAction[];
  reported?: boolean;
}) {
  const t = useTranslations("admin.forum");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(job: () => Promise<ModResult>) {
    setBusy(true);
    setError(null);
    const res = await job().catch((): ModResult => ({ ok: false, error: "generic" }));
    setBusy(false);
    if (!res.ok) {
      setError(t(`errors.${res.error}`));
      return;
    }
    router.refresh();
  }

  const btn = "rounded-full border px-3 py-1 text-xs font-semibold transition disabled:opacity-60";
  const tone = (a: ModAction) =>
    a === "hide" || a === "lock"
      ? "border-alert-600/40 text-alert-600 hover:bg-alert-600 hover:text-ivory-50"
      : "border-green-600/40 text-green-900 hover:bg-green-600 hover:text-ivory-50";

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {actions.map((a) => (
        <button
          key={a}
          type="button"
          disabled={busy}
          // على المحتوى المبلَّغ عنه: الإخفاء يحل بلاغاته معه.
          onClick={() => run(() => moderateForum({ targetType, targetId, action: a, resolve: reported && a === "hide" }))}
          className={`${btn} ${tone(a)}`}
        >
          {t(`actions.${a}`)}
        </button>
      ))}
      {reported && (
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => resolveForumReports({ targetType, targetId }))}
          className={`${btn} border-green-900 bg-green-900 text-ivory-50 hover:bg-green-600`}
        >
          {t("actions.resolve")}
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
