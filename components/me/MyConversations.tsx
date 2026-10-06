import "server-only";

import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { listConversations } from "@/lib/conversations/actions";
import { CONVERSATION_MODES, conversationHref, type ConversationSummary } from "@/lib/conversations/rules";
import { shortDateTime } from "@/lib/experts/format";

/**
 * F5: «محادثاتي» في /me: سجل المحادثات المحفوظة بكل أوضاعها، الأحدث أولاً، بجلسة المستخدم (RLS).
 * الضغط يفتح المحادثة في صفحتها (‎/?c= أو /new-muslim?c= أو /discover?c=) كاملةً بمصادرها.
 */
export async function MyConversations() {
  const t = await getTranslations("me.conversations");
  const th = await getTranslations("chat.history");
  const locale = await getLocale();
  const lists = await Promise.all(CONVERSATION_MODES.map((m) => listConversations(m).catch(() => ({ ok: false as const }))));
  const items: ConversationSummary[] = lists
    .flatMap((r) => (r.ok ? r.items : []))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  if (!items.length) {
    return (
      <div className="text-center">
        <p className="font-display text-2xl font-semibold text-green-900">{t("title")}</p>
        <p className="mx-auto mt-2 max-w-md text-ink-600">{t("empty")}</p>
        <Link href="/" className="mf-press mt-6 inline-block rounded-full bg-green-900 px-5 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-green-600">
          {t("cta")}
        </Link>
      </div>
    );
  }

  return (
    <section>
      <h2 className="text-lg font-bold text-green-900">{t("title")}</h2>
      <ul className="mt-3 divide-y divide-sand-200 rounded-xl border border-sand-200">
        {items.map((c) => (
          <li key={c.id}>
            <Link href={conversationHref(c)} className="flex flex-wrap items-center justify-between gap-2 p-3 hover:bg-green-900/[0.03]">
              <span dir="auto" className="min-w-0 truncate font-semibold text-green-900">
                {c.title || th("untitled")}
              </span>
              <span className="text-xs tabular-nums text-ink-600">
                {t(`modes.${c.mode}`)} · {shortDateTime(c.updatedAt, locale)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-ink-600">{th("note")}</p>
    </section>
  );
}
