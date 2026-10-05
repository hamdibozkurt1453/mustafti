"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { deleteAccount } from "@/lib/account/actions";
import { deleteConfirmed } from "@/lib/account/rules";

/**
 * «حذف حسابي وبياناتي» بتأكيد مزدوج: زر يفتح نافذة تشرح ما يُحذف وما يبقى، ثم كتابة عبارة التأكيد
 * بحروفها لتفعيل الحذف النهائي (والخادم يفحص العبارة نفسها مرة أخرى).
 */
export function DeleteAccount() {
  const t = useTranslations("me.settings");
  const locale = useLocale();
  const router = useRouter();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phrase = t("confirmPhrase");
  const ready = deleteConfirmed(typed, phrase);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const onClose = () => {
      setTyped("");
      setError(null);
    };
    d.addEventListener("close", onClose);
    return () => d.removeEventListener("close", onClose);
  }, []);

  async function confirm() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    const res = await deleteAccount({ confirm: typed, locale }).catch(() => ({ ok: false as const, error: "generic" as const }));
    if (res.ok) {
      // لا جلسة بعد الآن: إلى الرئيسية، والرأس يعود إلى «دخول» (يعيد قراءة الجلسة عند تغيّر المسار).
      dialog.current?.close();
      router.replace("/");
      router.refresh();
      return;
    }
    setBusy(false);
    setError(t(`errors.${res.error}`));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="mf-press rounded-full border border-alert-600/40 px-5 py-2.5 text-sm font-semibold text-alert-600 hover:bg-alert-600/5"
      >
        {t("delete")}
      </button>

      <dialog
        ref={dialog}
        aria-labelledby={`${id}-title`}
        className="mf-drop m-auto w-[min(32rem,calc(100vw-2rem))] rounded-[24px] border border-sand-200 bg-ivory-50 p-0 text-green-900 shadow-2xl backdrop:bg-green-900/60 backdrop:backdrop-blur-sm"
      >
        <div className="p-6 sm:p-7">
          <h2 id={`${id}-title`} className="text-xl font-bold text-alert-600">{t("dialogTitle")}</h2>
          <ul className="mt-4 list-disc space-y-1.5 ps-5 text-sm leading-relaxed text-ink-600">
            <li>{t("willDelete")}</li>
            <li>{t("willDetach")}</li>
            <li>{t("willKeep")}</li>
            <li className="font-semibold text-green-900">{t("irreversible")}</li>
          </ul>
          <label htmlFor={`${id}-confirm`} className="mt-5 block text-sm font-semibold">
            {t("typeToConfirm", { phrase })}
          </label>
          <input
            id={`${id}-confirm`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            className="mt-2 w-full rounded-xl border border-sand-200 bg-white px-4 py-2.5 outline-none focus:border-alert-600"
          />
          {error && <p role="alert" className="mt-3 text-sm text-alert-600">{error}</p>}
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="mf-press rounded-full border border-green-900/20 px-5 py-2.5 text-sm font-semibold hover:bg-green-900/5"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={!ready || busy}
              className="mf-press rounded-full bg-alert-600 px-5 py-2.5 text-sm font-semibold text-ivory-50 disabled:opacity-40"
            >
              {busy ? t("deleting") : t("confirmDelete")}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
