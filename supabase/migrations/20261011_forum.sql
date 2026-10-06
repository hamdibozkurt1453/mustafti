-- =====================================================================
-- مُستفتي — R4: «الحوار» (/forum)، منتدى نقاش محترم ومُراقَب.
-- يُنفَّذ مرة واحدة في Supabase ← SQL Editor ← New query ← Run. آمن لإعادة التشغيل.
--
-- الجداول:
--   forum_threads  ← المواضيع (الباب، واللغة، والحالة visible|hidden|locked، والتثبيت، وعدد الردود)
--   forum_posts    ← الردود (visible|hidden، و«جواب مختص»)
--   forum_reports  ← البلاغات (open|resolved)
-- ruling_notice: الحارس (lib/forum/guard.ts) وجد حكماً شرعياً جازماً من غير مختص،
--                فيُنشر مع تنبيه «هذا رأي مشارك وليس فتوى».
--
-- الصلاحيات (RLS):
--   - القراءة للجميع (حتى الزائر): المواضيع الظاهرة والمقفلة (المقفل يُقرأ ولا يُرد عليه)،
--     والردود الظاهرة في موضوع ظاهر أو مقفل. المخفي لا يراه أحد إلا الخادم (service role).
--   - الكتابة للمسجّلين فقط، كلٌّ باسمه (author_id = auth.uid())، وبأعمدة محددة:
--     لا يضبط أحد الحالة ولا التثبيت ولا العدد. «جواب مختص» للمختص المقبول على رده وحده.
--   - الإخفاء والقفل والتثبيت وحل البلاغات: من لوحة المشرف بمفتاح الخادم بعد فحص الدور
--     (super_admin وmoderator)، وكل فعل في admin_audit. لا سياسة تحديث لذلك للعموم.
--   - حد السبام في القاعدة أيضاً: 5 مشاركات (مواضيع وردود) في 10 دقائق لكل حساب.
-- =====================================================================

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------
-- الجداول
-- ---------------------------------------------------------------------
create table if not exists public.forum_threads (
  id               uuid primary key default gen_random_uuid(),
  author_id        uuid default auth.uid() references public.profiles (id) on delete set null,
  title            text not null check (char_length(title) between 5 and 160),
  body             text not null check (char_length(body) between 10 and 5000),
  category         text not null check (category in ('aqeedah', 'ibadat', 'muamalat', 'family', 'new_muslim', 'general')),
  lang             text not null default 'ar' check (lang ~ '^[a-z]{2}$'),
  status           text not null default 'visible' check (status in ('visible', 'hidden', 'locked')),
  pinned           boolean not null default false,
  ruling_notice    boolean not null default false,
  replies_count    integer not null default 0 check (replies_count >= 0),
  created_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

create table if not exists public.forum_posts (
  id               uuid primary key default gen_random_uuid(),
  thread_id        uuid not null references public.forum_threads (id) on delete cascade,
  author_id        uuid default auth.uid() references public.profiles (id) on delete set null,
  body             text not null check (char_length(body) between 2 and 5000),
  status           text not null default 'visible' check (status in ('visible', 'hidden')),
  is_expert_answer boolean not null default false,
  ruling_notice    boolean not null default false,
  created_at       timestamptz not null default now()
);

create table if not exists public.forum_reports (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('thread', 'post')),
  target_id   uuid not null,
  reporter_id uuid default auth.uid() references public.profiles (id) on delete set null,
  reason      text not null check (reason in ('abuse', 'takfir', 'incitement', 'spam', 'fatwa', 'other')),
  note        text check (note is null or char_length(note) <= 500),
  status      text not null default 'open' check (status in ('open', 'resolved')),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- الفهارس
-- ---------------------------------------------------------------------
-- القائمة: المثبّتة أولاً ثم الأحدث نشاطاً، وفلتر الباب.
create index if not exists forum_threads_list_idx     on public.forum_threads (pinned desc, last_activity_at desc) where status <> 'hidden';
create index if not exists forum_threads_category_idx on public.forum_threads (category, last_activity_at desc) where status <> 'hidden';
create index if not exists forum_threads_author_idx   on public.forum_threads (author_id, created_at desc);
-- البحث بالعنوان (ilike).
create index if not exists forum_threads_title_trgm   on public.forum_threads using gin (title gin_trgm_ops);
create index if not exists forum_posts_thread_idx     on public.forum_posts (thread_id, created_at);
create index if not exists forum_posts_author_idx     on public.forum_posts (author_id, created_at desc);
create index if not exists forum_reports_open_idx     on public.forum_reports (status, created_at desc);
create index if not exists forum_reports_target_idx   on public.forum_reports (target_type, target_id);
-- بلاغ مفتوح واحد لكل مُبلِّغ على المحتوى نفسه.
create unique index if not exists forum_reports_once_idx
  on public.forum_reports (target_type, target_id, reporter_id) where status = 'open';

-- ---------------------------------------------------------------------
-- حد السبام: 5 مشاركات (مواضيع وردود معاً) في 10 دقائق لكل حساب.
-- الخادم يفحصه قبل النشر (رسالة واضحة)، وهذا المشغّل يضمنه ولو كُتب مباشرة بالمفتاح العام.
-- ---------------------------------------------------------------------
create or replace function public.forum_rate_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_recent int;
begin
  if new.author_id is null then
    return new;
  end if;
  select
    (select count(*) from public.forum_threads t where t.author_id = new.author_id and t.created_at > now() - interval '10 minutes')
  + (select count(*) from public.forum_posts p where p.author_id = new.author_id and p.created_at > now() - interval '10 minutes')
  into v_recent;
  if v_recent >= 5 then
    raise exception 'forum_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists forum_threads_rate_limit on public.forum_threads;
create trigger forum_threads_rate_limit before insert on public.forum_threads
  for each row execute function public.forum_rate_limit();

drop trigger if exists forum_posts_rate_limit on public.forum_posts;
create trigger forum_posts_rate_limit before insert on public.forum_posts
  for each row execute function public.forum_rate_limit();

-- ---------------------------------------------------------------------
-- عدد الردود الظاهرة وآخر نشاط للموضوع (يحدّثهما المشغّل، لا الكاتب).
-- ---------------------------------------------------------------------
create or replace function public.forum_post_counter()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'visible' then
      update public.forum_threads
        set replies_count = replies_count + 1, last_activity_at = new.created_at
        where id = new.thread_id;
    end if;
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    update public.forum_threads
      set replies_count = greatest(0, replies_count + case when new.status = 'visible' then 1 else -1 end)
      where id = new.thread_id;
  end if;
  return null;
end;
$$;

drop trigger if exists forum_posts_counter on public.forum_posts;
create trigger forum_posts_counter after insert or update of status on public.forum_posts
  for each row execute function public.forum_post_counter();

revoke all on function public.forum_rate_limit()   from public, anon, authenticated;
revoke all on function public.forum_post_counter() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- الامتيازات
-- ---------------------------------------------------------------------
revoke all on public.forum_threads, public.forum_posts, public.forum_reports from anon, authenticated;

grant select on public.forum_threads, public.forum_posts to anon, authenticated;
-- الكتابة: أعمدة المحتوى فقط (الحالة والتثبيت والعدد بقيمها الافتراضية).
grant insert (author_id, title, body, category, lang, ruling_notice) on public.forum_threads to authenticated;
grant insert (author_id, thread_id, body, is_expert_answer, ruling_notice) on public.forum_posts to authenticated;
grant update (is_expert_answer) on public.forum_posts to authenticated;
-- البلاغ يُكتب ولا يُقرأ إلا من الخادم.
grant insert (reporter_id, target_type, target_id, reason, note) on public.forum_reports to authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.forum_threads enable row level security;
alter table public.forum_posts   enable row level security;
alter table public.forum_reports enable row level security;

-- القراءة: الظاهر (والمقفل) فقط.
drop policy if exists forum_threads_select on public.forum_threads;
create policy forum_threads_select on public.forum_threads for select to anon, authenticated
  using (status in ('visible', 'locked'));

drop policy if exists forum_posts_select on public.forum_posts;
create policy forum_posts_select on public.forum_posts for select to anon, authenticated
  using (
    status = 'visible'
    and exists (select 1 from public.forum_threads t where t.id = thread_id and t.status in ('visible', 'locked'))
  );

-- الكتابة: المسجّل باسمه فقط.
drop policy if exists forum_threads_insert_own on public.forum_threads;
create policy forum_threads_insert_own on public.forum_threads for insert to authenticated
  with check (author_id = auth.uid() and status = 'visible' and pinned = false and replies_count = 0);

-- الرد في موضوع ظاهر غير مقفل، و«جواب مختص» للمختص المقبول وحده.
drop policy if exists forum_posts_insert_own on public.forum_posts;
create policy forum_posts_insert_own on public.forum_posts for insert to authenticated
  with check (
    author_id = auth.uid()
    and status = 'visible'
    and (not is_expert_answer or public.is_approved_expert())
    and exists (select 1 from public.forum_threads t where t.id = thread_id and t.status = 'visible')
  );

-- المختص المقبول يميّز رده (أو يلغي التمييز)، ورده هو فقط.
drop policy if exists forum_posts_mark_expert on public.forum_posts;
create policy forum_posts_mark_expert on public.forum_posts for update to authenticated
  using (author_id = auth.uid() and public.is_approved_expert())
  with check (author_id = auth.uid() and public.is_approved_expert());

drop policy if exists forum_reports_insert_own on public.forum_reports;
create policy forum_reports_insert_own on public.forum_reports for insert to authenticated
  with check (reporter_id = auth.uid() and status = 'open');
