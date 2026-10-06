"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { locales, localeNames } from "@/i18n/locales";
import {
  addForumCategory,
  assignModerator,
  deleteForumPost,
  moveForumCategory,
  removeModerator,
  setForumCategoryActive,
  type AdminForumResult,
} from "@/lib/forum/category-actions";

/**
 * F3: أدوات «الحوار» في لوحة المشرف: إدارة الأبواب وتعيين المشرفين (super_admin)، وحذف رد (moderator فأعلى).
 * الأزرار لا تُرسم إلا لأصحاب الدور، والدور يُفحص ثانية في الخادم لكل فعل.
 */

function useRun() {
  const t = useTranslations("admin.forum.settings");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(job: () => Promise<AdminForumResult>, after?: () => void) {
    setBusy(true);
    setMessage(null);
    const res = await job().catch((): AdminForumResult => ({ ok: false, error: "generic" }));
    setBusy(false);
    if (!res.ok) return setMessage({ ok: false, text: t(`errors.${res.error}`) });
    setMessage({ ok: true, text: t("saved") });
    after?.();
    router.refresh();
  }
  return { busy, message, run };
}

function Message({ message }: { message: { ok: boolean; text: string } | null }) {
  if (!message) return null;
  return (
    <span role={message.ok ? "status" : "alert"} className={`text-xs font-semibold ${message.ok ? "text-green-600" : "text-alert-600"}`}>
      {message.text}
    </span>
  );
}

const pill = "rounded-full border px-3 py-1 text-xs font-semibold transition disabled:opacity-50";
const field = "w-full rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm text-green-900 outline-none focus:border-green-600";

export type CategoryItem = { slug: string; label: string; active: boolean; threads: string };

export function CategoryManager({ items, ready }: { items: CategoryItem[]; ready: boolean }) {
  const t = useTranslations("admin.forum.settings");
  const { busy, message, run } = useRun();
  const [open, setOpen] = useState(false);

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const name = Object.fromEntries(locales.map((l) => [l, String(data.get(`name-${l}`) ?? "")]));
    await run(() => addForumCategory({ slug: String(data.get("slug") ?? ""), name }), () => form.reset());
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white">
        {items.map((c, i) => (
          <li key={c.slug} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
            <span className="min-w-0">
              <span className={`font-semibold ${c.active ? "text-green-900" : "text-ink-600 line-through"}`}>{c.label}</span>
              <span className="ms-2 text-xs text-ink-600" dir="ltr">{c.slug}</span>
              <span className="ms-2 text-xs text-ink-600">· {c.threads}</span>
              {!c.active && <span className="ms-2 rounded-full bg-alert-600/10 px-2 py-0.5 text-[11px] font-semibold text-alert-600">{t("inactive")}</span>}
            </span>
            {ready && (
              <span className="flex flex-wrap gap-1.5">
                <button type="button" disabled={busy || i === 0} onClick={() => run(() => moveForumCategory({ slug: c.slug, dir: "up" }))} className={`${pill} border-sand-200 text-green-900 hover:bg-green-900/5`} aria-label={`${t("up")}: ${c.label}`}>
                  ↑
                </button>
                <button type="button" disabled={busy || i === items.length - 1} onClick={() => run(() => moveForumCategory({ slug: c.slug, dir: "down" }))} className={`${pill} border-sand-200 text-green-900 hover:bg-green-900/5`} aria-label={`${t("down")}: ${c.label}`}>
                  ↓
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => setForumCategoryActive({ slug: c.slug, active: !c.active }))}
                  className={`${pill} ${c.active ? "border-alert-600/40 text-alert-600 hover:bg-alert-600 hover:text-ivory-50" : "border-green-600/40 text-green-900 hover:bg-green-600 hover:text-ivory-50"}`}
                >
                  {c.active ? t("disable") : t("enable")}
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {ready && (
        <div className="rounded-xl border border-sand-200 bg-white p-4">
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="font-semibold text-green-900">
            + {t("addTitle")}
          </button>
          {open && (
            <form onSubmit={onAdd} className="mt-3 space-y-3">
              <label className="block text-sm text-green-900">
                {t("slugLabel")}
                <input name="slug" required pattern="[a-z][a-z0-9_]{1,31}" maxLength={32} dir="ltr" className={`${field} mt-1`} />
              </label>
              <p className="text-xs text-ink-600">{t("nameLabel")}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {locales.map((l) => (
                  <label key={l} className="block text-xs text-ink-600">
                    {localeNames[l]}
                    {(l === "ar" || l === "en") && " *"}
                    <input name={`name-${l}`} required={l === "ar" || l === "en"} maxLength={40} dir="auto" className={`${field} mt-0.5`} />
                  </label>
                ))}
              </div>
              <button type="submit" disabled={busy} className="mf-press rounded-full bg-green-900 px-5 py-2 text-sm font-semibold text-ivory-50 hover:bg-green-600 disabled:opacity-60">
                {t("add")}
              </button>
            </form>
          )}
        </div>
      )}
      <Message message={message} />
    </div>
  );
}

export function ModeratorManager({ moderators }: { moderators: { id: string; email: string | null; name: string | null }[] }) {
  const t = useTranslations("admin.forum.settings");
  const { busy, message, run } = useRun();

  async function onAssign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = String(new FormData(form).get("email") ?? "");
    await run(() => assignModerator({ email }), () => form.reset());
  }

  return (
    <div className="space-y-3">
      <form onSubmit={onAssign} className="flex flex-wrap gap-2">
        <label htmlFor="mod-email" className="sr-only">
          {t("emailLabel")}
        </label>
        <input id="mod-email" name="email" type="email" required dir="ltr" placeholder={t("emailLabel")} className={`${field} min-w-0 flex-1`} />
        <button type="submit" disabled={busy} className="mf-press flex-none rounded-full bg-green-900 px-5 py-2 text-sm font-semibold text-ivory-50 hover:bg-green-600 disabled:opacity-60">
          {t("assign")}
        </button>
      </form>
      {!moderators.length ? (
        <p className="text-sm text-ink-600">{t("noMods")}</p>
      ) : (
        <ul className="divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white">
          {moderators.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span>
                <span className="font-semibold text-green-900">{m.name || "—"}</span>
                <span className="ms-2 text-ink-600" dir="ltr">{m.email}</span>
              </span>
              <button type="button" disabled={busy} onClick={() => run(() => removeModerator({ userId: m.id }))} className={`${pill} border-alert-600/40 text-alert-600 hover:bg-alert-600 hover:text-ivory-50`}>
                {t("remove")}
              </button>
            </li>
          ))}
        </ul>
      )}
      <Message message={message} />
    </div>
  );
}

export function DeletePostButton({ postId }: { postId: string }) {
  const t = useTranslations("admin.forum");
  const ts = useTranslations("admin.forum.settings");
  const { busy, message, run } = useRun();
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (window.confirm(ts("confirmDelete"))) void run(() => deleteForumPost({ postId }));
        }}
        className={`${pill} border-alert-600 bg-alert-600 text-ivory-50 hover:brightness-110`}
      >
        {t("actions.delete")}
      </button>
      {message && !message.ok && <Message message={message} />}
    </span>
  );
}
