"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteConversation,
  listConversations,
  loadConversation,
  renameConversation,
  saveConversation,
} from "@/lib/conversations/actions";
import { toRows, UUID_RE, type ConversationMode, type ConversationSummary, type UiMessage } from "@/lib/conversations/rules";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { ChatMessage } from "./useChat";

/** المحادثة المفتوحة في هذا المتصفح لكل وضع، فتعود عند فتح الصفحة. */
const activeKey = (mode: ConversationMode) => `mustafti.conversation.${mode}`;

function readActive(mode: ConversationMode): string | null {
  try {
    return window.localStorage.getItem(activeKey(mode));
  } catch {
    return null;
  }
}

function writeActive(mode: ConversationMode, id: string | null) {
  try {
    if (id) window.localStorage.setItem(activeKey(mode), id);
    else window.localStorage.removeItem(activeKey(mode));
  } catch {
    /* لا شيء */
  }
}

type Chat = {
  messages: ChatMessage[];
  busy: boolean;
  loaded: boolean;
  reset: () => void;
  load: (messages: ChatMessage[]) => void;
};

/**
 * F2: سجل المحادثات للمسجّل: القائمة، والمحادثة المفتوحة، والحفظ الآلي بعد كل جواب مكتمل،
 * وفتح محادثة قديمة كاملة بمصادرها، وإعادة التسمية والحذف. الزائر (signedIn=false) لا شيء هنا،
 * ويبقى على التخزين المحلي في useChat كما كان.
 */
export function useConversations(mode: ConversationMode, chat: Chat) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const [listing, setListing] = useState(false);
  const activeRef = useRef<string | null>(null);
  const savedSig = useRef("");
  const saving = useRef<Promise<void>>(Promise.resolve());

  const setActive = useCallback(
    (id: string | null) => {
      activeRef.current = id;
      setActiveIdState(id);
      writeActive(mode, id);
    },
    [mode],
  );

  const refresh = useCallback(async () => {
    setListing(true);
    const res = await listConversations(mode).catch(() => ({ ok: false as const }));
    setListing(false);
    if (res.ok) setItems(res.items);
  }, [mode]);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- لا حسابات: زائر دائماً
      setSignedIn(false);
      return;
    }
    const supabase = createClient();
    supabase.auth
      .getSession()
      .then(({ data }) => setSignedIn(Boolean(data.session)))
      .catch(() => setSignedIn(false));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setSignedIn(Boolean(session)));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    activeRef.current = readActive(mode);
    setActiveIdState(activeRef.current);
    void refresh();
  }, [signedIn, mode, refresh]);

  // الحفظ الآلي: بعد كل جواب مكتمل (لا أثناء البث)، إن تغيّر ما يُحفظ.
  const { messages, busy, loaded } = chat;
  useEffect(() => {
    if (!signedIn || !loaded || busy) return;
    const rows = toRows(messages as unknown as UiMessage[]);
    if (!rows.some((r) => r.role === "user") || !rows.some((r) => r.role === "bot")) return;
    const sig = `${activeRef.current ?? ""}|${rows.length}|${rows[rows.length - 1].id}|${rows[rows.length - 1].content.length}`;
    if (sig === savedSig.current) return;
    savedSig.current = sig;
    const snapshot = messages;
    saving.current = saving.current.then(async () => {
      const res = await saveConversation({ id: activeRef.current, mode, messages: snapshot }).catch(() => ({ ok: false as const }));
      if (!res.ok) return;
      if (res.id !== activeRef.current) setActive(res.id);
      savedSig.current = `${res.id}|${rows.length}|${rows[rows.length - 1].id}|${rows[rows.length - 1].content.length}`;
      await refresh();
    });
  }, [messages, busy, loaded, signedIn, mode, refresh, setActive]);

  const open = useCallback(
    async (id: string): Promise<boolean> => {
      if (id === activeRef.current && chat.messages.length) return true;
      const res = await loadConversation(id).catch(() => ({ ok: false as const }));
      if (!res.ok) return false;
      const rows = toRows(res.messages);
      savedSig.current = rows.length ? `${id}|${rows.length}|${rows[rows.length - 1].id}|${rows[rows.length - 1].content.length}` : "";
      setActive(id);
      chat.load(res.messages as unknown as ChatMessage[]);
      return true;
    },
    [chat, setActive],
  );

  // F5: ‎?c=المعرّف (من «محادثاتي» في /me): تُفتح تلك المحادثة بعد قراءة المحفوظ، ثم يُحذف المعامل من الرابط.
  const linkOpened = useRef(false);
  useEffect(() => {
    if (!signedIn || !loaded || linkOpened.current) return;
    linkOpened.current = true;
    const url = new URL(window.location.href);
    const id = url.searchParams.get("c");
    if (!id || !UUID_RE.test(id)) return;
    url.searchParams.delete("c");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- استجابة لرابط خارجي (‎?c=) مرة واحدة
    void open(id);
  }, [signedIn, loaded, open]);

  /** «محادثة جديدة»: المحادثة الحالية محفوظة أصلاً؛ تبدأ صفحة فارغة. */
  const startNew = useCallback(() => {
    savedSig.current = "";
    setActive(null);
    chat.reset();
  }, [chat, setActive]);

  const rename = useCallback(
    async (id: string, title: string) => {
      setItems((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
      const res = await renameConversation(id, title).catch(() => ({ ok: false as const }));
      if (!res.ok) await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      setItems((prev) => prev.filter((c) => c.id !== id));
      const res = await deleteConversation(id).catch(() => ({ ok: false as const }));
      if (!res.ok) return refresh();
      if (id === activeRef.current) startNew();
    },
    [refresh, startNew],
  );

  return { signedIn: signedIn === true, items, activeId, listing, open, startNew, rename, remove };
}

export type ConversationsApi = ReturnType<typeof useConversations>;
