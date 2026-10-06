-- =====================================================================
-- مُستفتي — F2: سجل المحادثات للمستخدم المسجّل (مثل ChatGPT).
-- يُنفَّذ مرة واحدة في Supabase ← SQL Editor ← New query ← Run. آمن لإعادة التشغيل.
--
-- conversations: محادثة لكل صاحب حساب، بوضعها (العامة، والمرشد، والداعية) وعنوانها (من أول سؤال).
-- messages: رسائل المحادثة بترتيبها (seq)، والنص في content، وما يلزم لإعادة العرض بمصادره في reply.
-- RLS: كل مستخدم يرى محادثاته ورسائلها فقط، ويكتبها باسمه فقط. الزائر لا شيء.
-- الحذف مع الحساب: user_id → profiles (on delete cascade)، والرسائل تتبع المحادثة.
-- =====================================================================

create table if not exists public.conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  mode        text not null default 'general' check (mode in ('general', 'new_muslim', 'discover')),
  title       text not null default '' check (length(title) <= 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists conversations_user_mode_updated_idx on public.conversations (user_id, mode, updated_at desc);

create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  seq              int not null default 0 check (seq >= 0),
  role             text not null check (role in ('user', 'bot')),
  content          text not null default '' check (length(content) <= 20000),
  reply            jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists messages_conversation_seq_idx on public.messages (conversation_id, seq);

-- آخر نشاط: كل رسالة جديدة أو معدّلة تحدّث updated_at في محادثتها (ترتيب الشريط الجانبي).
create or replace function public.touch_conversation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end $$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert or update on public.messages
  for each row execute function public.touch_conversation();

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

revoke all on public.conversations from anon, authenticated;
revoke all on public.messages from anon, authenticated;
grant select, delete on public.conversations to authenticated;
grant insert (mode, title) on public.conversations to authenticated;
grant update (title) on public.conversations to authenticated;
grant select, insert, update, delete on public.messages to authenticated;

drop policy if exists conversations_own on public.conversations;
create policy conversations_own on public.conversations for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists messages_own on public.messages;
create policy messages_own on public.messages for all to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()));
