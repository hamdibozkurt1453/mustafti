"use server";

import { z } from "zod";
import { getAuthContext } from "@/lib/auth/roles";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import {
  cleanTitle,
  CONVERSATION_MODES,
  firstQuestion,
  fromRows,
  LIST_LIMIT,
  MAX_SAVED_MESSAGES,
  titleFrom,
  toRows,
  UUID_RE,
  type ConversationMode,
  type ConversationSummary,
  type MessageRow,
  type UiMessage,
} from "./rules";

/**
 * F2: سجل المحادثات للمستخدم المسجّل (كل الأدوار). كل فعل يفحص الدخول، ثم يقرأ ويكتب **بجلسة
 * المستخدم** فتحكمه RLS (كلٌّ يرى محادثاته فقط). الزائر: { ok: false } ويبقى على التخزين المحلي.
 * قبل migration ‏20261013_conversations.sql تفشل الاستعلامات بهدوء ({ ok: false }) فتعمل المحادثة كما كانت.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false };

const id = z.string().regex(UUID_RE);
const mode = z.enum(CONVERSATION_MODES);

async function session() {
  if (!isSupabaseConfigured()) return null;
  const ctx = await getAuthContext();
  if (!ctx.userId) return null;
  return { userId: ctx.userId, db: await createClient() };
}

/** محادثات المستخدم في وضع واحد، الأحدث أولاً. */
export async function listConversations(rawMode: string): Promise<Result<{ items: ConversationSummary[] }>> {
  const m = mode.safeParse(rawMode);
  const s = await session();
  if (!m.success || !s) return { ok: false };
  const { data, error } = await s.db
    .from("conversations")
    .select("id, title, mode, updated_at")
    .eq("mode", m.data)
    .order("updated_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error || !data) return { ok: false };
  return {
    ok: true,
    items: data.map((r) => ({ id: r.id as string, title: r.title as string, mode: r.mode as ConversationMode, updatedAt: r.updated_at as string })),
  };
}

/** محادثة كاملة برسائلها ومصادرها. */
export async function loadConversation(rawId: string): Promise<Result<{ messages: UiMessage[] }>> {
  const c = id.safeParse(rawId);
  const s = await session();
  if (!c.success || !s) return { ok: false };
  const { data, error } = await s.db
    .from("messages")
    .select("id, seq, role, content, reply")
    .eq("conversation_id", c.data)
    .order("seq")
    .limit(MAX_SAVED_MESSAGES);
  if (error || !data) return { ok: false };
  return { ok: true, messages: fromRows(data as MessageRow[]) };
}

const SaveInput = z.object({
  id: id.nullable(),
  mode,
  messages: z.array(z.object({ id: z.string(), role: z.enum(["user", "bot"]), text: z.string() }).passthrough()).max(200),
});

/**
 * الحفظ الآلي بعد كل جواب: ينشئ المحادثة إن لم توجد (العنوان من أول سؤال)، ثم يكتب رسائلها المكتملة
 * (upsert بالمعرّف، فلا تتكرر). يعيد معرّف المحادثة.
 */
export async function saveConversation(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = SaveInput.safeParse(input);
  const s = await session();
  if (!parsed.success || !s) return { ok: false };
  const messages = parsed.data.messages as UiMessage[];
  const rows = toRows(messages);
  if (!rows.some((r) => r.role === "user")) return { ok: false };

  let conversationId = parsed.data.id;
  if (conversationId) {
    // المحادثة لصاحبها؟ (RLS: لا صف لغيره.)
    const { data } = await s.db.from("conversations").select("id").eq("id", conversationId).maybeSingle();
    if (!data) conversationId = null;
  }
  if (!conversationId) {
    const { data, error } = await s.db
      .from("conversations")
      .insert({ mode: parsed.data.mode, title: titleFrom(firstQuestion(messages)) })
      .select("id")
      .single();
    if (error || !data) return { ok: false };
    conversationId = data.id as string;
  }

  const { error } = await s.db.from("messages").upsert(
    rows.map((r) => ({ ...r, conversation_id: conversationId })),
    { onConflict: "id" },
  );
  if (error) {
    console.error("conversations save:", error.message);
    return { ok: false };
  }
  return { ok: true, id: conversationId };
}

export async function renameConversation(rawId: string, rawTitle: string): Promise<Result> {
  const c = id.safeParse(rawId);
  const title = cleanTitle(rawTitle);
  const s = await session();
  if (!c.success || !title || !s) return { ok: false };
  const { data, error } = await s.db.from("conversations").update({ title }).eq("id", c.data).select("id");
  return { ok: !error && Boolean(data?.length) };
}

export async function deleteConversation(rawId: string): Promise<Result> {
  const c = id.safeParse(rawId);
  const s = await session();
  if (!c.success || !s) return { ok: false };
  const { data, error } = await s.db.from("conversations").delete().eq("id", c.data).select("id");
  return { ok: !error && Boolean(data?.length) };
}
