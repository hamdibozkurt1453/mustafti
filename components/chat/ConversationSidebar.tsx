"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { CloseIcon, HistoryIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon } from "@/components/icons";
import { groupConversations, searchConversations, TITLE_MAX } from "@/lib/conversations/rules";
import type { ConversationsApi } from "./useConversations";

type Props = {
  api: ConversationsApi;
  /** «محادثة جديدة» في الصفحة (تمسح الخانة أيضاً). */
  onNew: () => void;
  /** في واجهة المحادثة: عمود ظاهر على الشاشات الواسعة (lg)، وبزر على الهاتف. خارجها: زر عائم فقط. */
  docked: boolean;
  /** الرأس ثابت فوق الصفحة (الرئيسية): يبدأ العمود تحته بإزاحة ارتفاعه. */
  underFixedHeader?: boolean;
};

/**
 * F2: الشريط الجانبي لسجل المحادثات (للمسجّل فقط): «محادثة جديدة»، والبحث، والمحادثات مجمّعة
 * (اليوم، أمس، آخر 7 أيام، أقدم)، وإعادة التسمية والحذف. في بداية السطر (start): يمين في RTL، ويسار في غيرها.
 * على الهاتف يُطوى، ويُفتح بزر «محادثاتي».
 */
export function ConversationSidebar({ api, onNew, docked, underFixedHeader = false }: Props) {
  const t = useTranslations("chat.history");
  const tc = useTranslations("chat");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- التاريخ في المتصفح فقط (لا اختلاف مع HTML الخادم)
    setNow(new Date());
  }, [api.items]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const groups = useMemo(
    () => (now ? groupConversations(searchConversations(api.items, query), now) : []),
    [api.items, query, now],
  );

  if (!api.signedIn) return null;

  async function choose(id: string) {
    if (await api.open(id)) setOpen(false);
  }

  function startRename(id: string, title: string) {
    setConfirming(null);
    setEditing(id);
    setDraft(title);
  }

  async function commitRename() {
    const id = editing;
    const title = draft.trim();
    setEditing(null);
    if (id && title) await api.rename(id, title);
  }

  const panel = (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            onNew();
            setOpen(false);
          }}
          className="mf-press flex flex-1 items-center justify-center gap-2 rounded-full bg-gold-500 px-4 py-2.5 text-sm font-semibold text-green-900 hover:brightness-105"
        >
          <PlusIcon className="size-4" />
          {tc("newChat")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t("close")}
          className={`flex-none rounded-full p-2 text-ivory-50/80 hover:bg-ivory-50/10 hover:text-ivory-50 ${docked ? "lg:hidden" : ""}`}
        >
          <CloseIcon className="size-5" />
        </button>
      </div>

      <label className="relative block">
        <span className="sr-only">{t("search")}</span>
        <SearchIcon className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-ivory-50/50" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          className="w-full rounded-full border border-ivory-50/15 bg-ivory-50/[0.06] py-2 pe-3 ps-9 text-sm text-ivory-50 outline-none placeholder:text-ivory-50/45 focus:border-gold-500"
        />
      </label>

      <nav aria-label={t("title")} className="mf-no-scrollbar -mx-1 flex-1 overflow-y-auto px-1">
        {api.items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-ivory-50/60">{api.listing ? "…" : t("empty")}</p>
        ) : groups.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-ivory-50/60">{t("noResults")}</p>
        ) : (
          groups.map((g) => (
            <section key={g.group} className="mb-4">
              <h3 className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-gold-500/90">{t(`groups.${g.group}`)}</h3>
              <ul className="space-y-0.5">
                {g.items.map((c) => {
                  const active = c.id === api.activeId;
                  if (editing === c.id)
                    return (
                      <li key={c.id}>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void commitRename();
                          }}
                        >
                          <input
                            autoFocus
                            value={draft}
                            maxLength={TITLE_MAX}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={() => void commitRename()}
                            onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                            aria-label={t("rename")}
                            dir="auto"
                            className="w-full rounded-xl border border-gold-500 bg-ivory-50/10 px-3 py-2 text-sm text-ivory-50 outline-none"
                          />
                        </form>
                      </li>
                    );
                  return (
                    <li key={c.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => void choose(c.id)}
                        aria-current={active ? "true" : undefined}
                        className={`block w-full truncate rounded-xl py-2 pe-16 ps-3 text-start text-sm transition-colors ${
                          active ? "bg-ivory-50/15 font-semibold text-ivory-50" : "text-ivory-50/80 hover:bg-ivory-50/[0.08] hover:text-ivory-50"
                        }`}
                      >
                        <bdi dir="auto">{c.title || t("untitled")}</bdi>
                      </button>
                      {confirming === c.id ? (
                        <div className="absolute inset-y-0 end-1 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setConfirming(null);
                              void api.remove(c.id);
                            }}
                            className="rounded-full bg-alert-600 px-2.5 py-1 text-[11px] font-semibold text-white"
                          >
                            {t("confirmDelete")}
                          </button>
                          <button type="button" onClick={() => setConfirming(null)} aria-label={t("cancel")} className="rounded-full p-1 text-ivory-50/70 hover:text-ivory-50">
                            <CloseIcon className="size-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="absolute inset-y-0 end-1 flex items-center gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => startRename(c.id, c.title)}
                            aria-label={t("rename")}
                            title={t("rename")}
                            className="rounded-full p-1.5 text-ivory-50/70 hover:bg-ivory-50/10 hover:text-ivory-50"
                          >
                            <PencilIcon className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirming(c.id)}
                            aria-label={t("delete")}
                            title={t("delete")}
                            className="rounded-full p-1.5 text-ivory-50/70 hover:bg-ivory-50/10 hover:text-alert-600"
                          >
                            <TrashIcon className="size-3.5" />
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </nav>
      <p className="px-2 text-[11px] leading-relaxed text-ivory-50/50">{t("note")}</p>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="conversation-sidebar"
        className={`mf-press fixed bottom-24 start-3 z-30 flex items-center gap-2 rounded-full bg-green-900 px-4 py-2.5 text-sm font-semibold text-ivory-50 shadow-[0_12px_30px_-12px_rgb(4_48_31/0.7)] hover:bg-green-600 ${
          docked ? "top-20 bottom-auto lg:hidden" : "sm:bottom-6"
        }`}
      >
        <HistoryIcon className="size-4" />
        {t("title")}
      </button>

      {open && <div aria-hidden onClick={() => setOpen(false)} className={`fixed inset-0 z-40 bg-green-900/40 backdrop-blur-[2px] ${docked ? "lg:hidden" : ""}`} />}

      <aside
        id="conversation-sidebar"
        aria-label={t("title")}
        data-testid="conversation-sidebar"
        className={`fixed bottom-0 start-0 z-50 w-[min(19rem,86vw)] bg-green-900 text-ivory-50 shadow-2xl transition-transform duration-300 motion-reduce:transition-none ${
          open ? "translate-x-0" : "ltr:-translate-x-full rtl:translate-x-full"
        } ${
          // F2b: على الحاسوب عمود في مكانه (sticky) بكامل الارتفاع من أسفل الرأس إلى أسفل الشاشة، بلا انقطاع.
          docked
            ? // على الهاتف: من أسفل الرأس إلى أسفل الشاشة (الرأس يبقى فوق واجهة المحادثة).
              `top-16 ${underFixedHeader ? "lg:mt-16" : ""} lg:sticky lg:top-16 lg:bottom-auto lg:z-20 lg:h-[calc(100svh-4rem)] lg:w-72 lg:flex-none lg:self-start lg:translate-x-0! lg:shadow-none`
            : "top-0"
        }`}
      >
        {panel}
      </aside>
    </>
  );
}
