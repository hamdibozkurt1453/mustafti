-- =====================================================================
-- مُستفتي — بنية قاعدة البيانات (الخطة، القسم 5) وسياسات RLS والمخزن الخاص.
-- يُنفَّذ مرة واحدة في Supabase ← SQL Editor ← New query ← Run.
-- آمن لإعادة التشغيل: كل شيء "if not exists" أو "drop … if exists" قبل الإنشاء.
--
-- مبادئ الصلاحيات:
--   • الزائر (anon) لا يقرأ ولا يكتب أي جدول مباشرة. ملف الحالة يُفتح عبر الخادم وبالرمز السري.
--   • المستخدم (authenticated) يقرأ صفوفه فقط، ويعدّل تفضيلاته فقط.
--   • المختص المقبول يقرأ الملفات المحالة إليه فقط.
--   • المشرف يقرأ حسب دوره (super_admin / reviewer / moderator)، وبشرط MFA (aal2).
--   • كل الكتابة الأخرى عبر الخادم بمفتاح service role بعد requireRole() في الكود.
-- =====================================================================


-- ---------------------------------------------------------------------
-- الأنواع
-- ---------------------------------------------------------------------
do $$ begin
  create type public.admin_role as enum ('super_admin', 'reviewer', 'moderator', 'viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.expert_role as enum ('mufti', 'daee', 'mentor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.expert_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.case_status as enum ('clarifying', 'submitted', 'assigned', 'answered', 'closed');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- الجداول
-- ---------------------------------------------------------------------

-- الملف الشخصي: صف لكل حساب، يُنشأ تلقائياً عند التسجيل (المشغّل أسفل الملف).
create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text,
  display_name   text,
  preferred_lang text not null default 'ar',
  city           text,
  calc_method    text,
  created_at     timestamptz not null default now()
);

-- المختصون: الحساب معلّق (pending) حتى يقبله مشرف يدوياً.
create table if not exists public.experts (
  id            uuid primary key references public.profiles (id) on delete cascade,
  role          public.expert_role not null,
  specialty     text,
  country       text,
  languages     text[] not null default '{}',
  degree        text,
  institution   text,
  grad_year     int,
  traditional   boolean not null default false,
  tazkiyat      jsonb not null default '[]'::jsonb,
  doc_paths     text[] not null default '{}',
  pledge_at     timestamptz,
  status        public.expert_status not null default 'pending',
  decided_by    uuid references public.profiles (id) on delete set null,
  decided_at    timestamptz,
  reject_reason text,
  created_at    timestamptz not null default now()
);

-- المشرفون وأدوارهم. لا تسجيل علني: يُضاف المشرف من الخادم فقط.
create table if not exists public.admins (
  id         uuid primary key references public.profiles (id) on delete cascade,
  role       public.admin_role not null,
  added_by   uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- سجل تدقيق أفعال المشرفين.
create table if not exists public.admin_audit (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid references public.profiles (id) on delete set null,
  action     text not null,
  target     text,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ملف المسألة (الحالة الشخصية).
-- secret_token_hash: بصمة SHA-256 للرمز السري لا الرمز نفسه، فلو تسرّبت القاعدة لا تُفتح الملفات.
-- الرمز الأصلي يظهر للسائل مرة واحدة في رابط المتابعة.
create table if not exists public.cases (
  id                uuid primary key default gen_random_uuid(),
  secret_token_hash text not null unique,
  owner_id          uuid references public.profiles (id) on delete set null,
  user_type         text,
  level             text,
  chapter           text,
  priority          text,
  lang              text,
  status            public.case_status not null default 'clarifying',
  route_to          public.expert_role,
  assigned_expert   uuid references public.experts (id) on delete set null,
  contact_email     text,
  -- R3: مسار المسألة (migrations/20261009_case_track.sql).
  track             text not null default 'general' check (track in ('general', 'new_muslim', 'discover')),
  created_at        timestamptz not null default now()
);

create table if not exists public.case_messages (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references public.cases (id) on delete cascade,
  sender     text not null check (sender in ('user', 'assistant', 'expert', 'system')),
  content    text not null,
  created_at timestamptz not null default now()
);

-- الملف المرتب بلا هوية، وهو ما يراه المختص.
create table if not exists public.case_files (
  id                uuid primary key default gen_random_uuid(),
  case_id           uuid not null references public.cases (id) on delete cascade,
  pillars           jsonb not null default '{}'::jsonb,
  summary_ar        text,
  summary_user_lang text,
  unknowns          jsonb not null default '[]'::jsonb,
  approved_at       timestamptz,
  created_at        timestamptz not null default now()
);

create table if not exists public.expert_answers (
  id                uuid primary key default gen_random_uuid(),
  case_id           uuid not null references public.cases (id) on delete cascade,
  -- R2: يبقى الجواب إن حُذف حساب المختص (migrations/20261008_account_deletion.sql).
  expert_id         uuid references public.experts (id) on delete set null,
  answer_ar         text not null,
  answer_translated text,
  created_at        timestamptz not null default now()
);

-- «ينقص هذا السؤال»: ملاحظة المختص على ملف ناقص.
create table if not exists public.feedback_missing (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references public.cases (id) on delete cascade,
  expert_id  uuid not null references public.experts (id) on delete cascade,
  note       text not null,
  created_at timestamptz not null default now()
);

-- سجل الحارس: كل رد منعه الحارس وسببه.
create table if not exists public.guard_log (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid references public.cases (id) on delete set null,
  reason        text not null,
  original_text text,
  created_at    timestamptz not null default now()
);

-- إحصاءات الأسئلة العامة (بلا نص السؤال ولا هوية).
create table if not exists public.general_queries (
  id            uuid primary key default gen_random_uuid(),
  lang          text,
  level         text,
  found_sources int not null default 0,
  abstained     boolean not null default false,
  created_at    timestamptz not null default now()
);

-- حد الطلبات لكل عنوان IP (نافذة ثابتة). المفتاح بصمة لا العنوان نفسه.
create table if not exists public.rate_limits (
  key          text not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (key, window_start)
);

-- ---------------------------------------------------------------------
-- الفهارس
-- ---------------------------------------------------------------------
create index if not exists experts_status_idx          on public.experts (status);
create index if not exists admin_audit_admin_idx       on public.admin_audit (admin_id, created_at desc);
create index if not exists cases_owner_idx             on public.cases (owner_id, created_at desc);
create index if not exists cases_assigned_idx          on public.cases (assigned_expert, status);
create index if not exists cases_status_idx            on public.cases (status, created_at desc);
create index if not exists case_messages_case_idx      on public.case_messages (case_id, created_at);
create index if not exists case_files_case_idx         on public.case_files (case_id);
create index if not exists expert_answers_case_idx     on public.expert_answers (case_id);
create index if not exists expert_answers_expert_idx   on public.expert_answers (expert_id);
create index if not exists feedback_missing_case_idx   on public.feedback_missing (case_id);
create index if not exists guard_log_created_idx       on public.guard_log (created_at desc);
create index if not exists general_queries_created_idx on public.general_queries (created_at desc);
create index if not exists rate_limits_window_idx      on public.rate_limits (window_start);

-- ---------------------------------------------------------------------
-- دوال الصلاحيات (security definer: تقرأ الجداول دون أن تخضع لسياساتها، فلا حلقات)
-- ---------------------------------------------------------------------

-- دور المشرف الحالي، بشرط أن تكون الجلسة قد اجتازت MFA (aal2). وإلا null.
create or replace function public.current_admin_role()
returns public.admin_role
language sql stable security definer set search_path = ''
as $$
  select a.role
  from public.admins a
  where a.id = auth.uid()
    and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
$$;

create or replace function public.has_admin_role(roles public.admin_role[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.current_admin_role() = any (roles), false)
$$;

-- هل المستخدم الحالي مختص مقبول؟
create or replace function public.is_approved_expert()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.experts e
    where e.id = auth.uid() and e.status = 'approved'
  )
$$;

-- هل الحالة محالة إلى المختص الحالي (وهو مقبول)؟
create or replace function public.is_assigned_expert(p_case_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.cases c
    join public.experts e on e.id = c.assigned_expert
    where c.id = p_case_id and e.id = auth.uid() and e.status = 'approved'
  )
$$;

-- هل الحالة ملك المستخدم الحالي؟
create or replace function public.owns_case(p_case_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.cases c
    where c.id = p_case_id and c.owner_id = auth.uid()
  )
$$;

revoke all on function public.current_admin_role()            from public;
revoke all on function public.has_admin_role(public.admin_role[]) from public;
revoke all on function public.is_approved_expert()            from public;
revoke all on function public.is_assigned_expert(uuid)        from public;
revoke all on function public.owns_case(uuid)                 from public;
grant execute on function public.current_admin_role()            to authenticated;
grant execute on function public.has_admin_role(public.admin_role[]) to authenticated;
grant execute on function public.is_approved_expert()            to authenticated;
grant execute on function public.is_assigned_expert(uuid)        to authenticated;
grant execute on function public.owns_case(uuid)                 to authenticated;

-- حد الطلبات: يزيد العداد ذرّياً ويعيد true إن بقي الطلب ضمن الحد.
-- للخادم فقط (service role)، لا يستدعيه المتصفح.
create or replace function public.hit_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_window timestamptz :=
    to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count int;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into v_count;

  -- تنظيف خفيف للنوافذ القديمة (مرة في كل مئة طلب تقريباً).
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, int, int) to service_role;

-- ---------------------------------------------------------------------
-- إنشاء الملف الشخصي تلقائياً عند التسجيل
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, preferred_lang)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'preferred_lang', ''), 'ar')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- الامتيازات: الزائر لا شيء، والمسجّل قراءة فقط (والسياسات تحدد الصفوف).
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

grant select on
  public.profiles, public.experts, public.admins, public.admin_audit,
  public.case_messages, public.case_files, public.expert_answers,
  public.feedback_missing, public.guard_log, public.general_queries
to authenticated;

-- الحالات: لا يُعطى المسجّل عمودي الرمز السري والبريد؛ الخادم وحده يقرؤهما.
grant select (
  id, owner_id, user_type, level, chapter, priority, lang, status,
  route_to, assigned_expert, track, created_at
) on public.cases to authenticated;

-- المستخدم يعدّل تفضيلاته فقط (لا البريد ولا المعرّف).
grant update (display_name, preferred_lang, city, calc_method) on public.profiles to authenticated;

-- rate_limits: لا امتيازات لأحد غير service role.

-- الجداول التي تُنشأ لاحقاً لا تُفتح للزائر تلقائياً.
alter default privileges in schema public revoke all on tables from anon;

-- ---------------------------------------------------------------------
-- RLS: مفعّل على كل الجداول. لا سياسة للزائر (anon) في أي جدول.
-- ---------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.experts          enable row level security;
alter table public.admins           enable row level security;
alter table public.admin_audit      enable row level security;
alter table public.cases            enable row level security;
alter table public.case_messages    enable row level security;
alter table public.case_files       enable row level security;
alter table public.expert_answers   enable row level security;
alter table public.feedback_missing enable row level security;
alter table public.guard_log        enable row level security;
alter table public.general_queries  enable row level security;
alter table public.rate_limits      enable row level security;

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.has_admin_role(array['super_admin', 'reviewer', 'moderator']::public.admin_role[])
  );

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- experts: المختص يرى طلبه (لمعرفة حالته)، والمراجع والمشرف الأعلى يرون الكل.
drop policy if exists experts_select on public.experts;
create policy experts_select on public.experts for select to authenticated
  using (
    id = auth.uid()
    or public.has_admin_role(array['super_admin', 'reviewer']::public.admin_role[])
  );

-- admins: كل مشرف يرى صفه، والمشرف الأعلى يرى الكل.
drop policy if exists admins_select on public.admins;
create policy admins_select on public.admins for select to authenticated
  using (
    id = auth.uid()
    or public.has_admin_role(array['super_admin']::public.admin_role[])
  );

-- admin_audit: المشرف الأعلى فقط.
drop policy if exists admin_audit_select on public.admin_audit;
create policy admin_audit_select on public.admin_audit for select to authenticated
  using (public.has_admin_role(array['super_admin']::public.admin_role[]));

-- cases: صاحبها، أو المختص المقبول المحالة إليه، أو المشرف الأعلى والمتابع.
drop policy if exists cases_select on public.cases;
create policy cases_select on public.cases for select to authenticated
  using (
    owner_id = auth.uid()
    or (assigned_expert = auth.uid() and public.is_approved_expert())
    or public.has_admin_role(array['super_admin', 'moderator']::public.admin_role[])
  );

-- case_messages: المحادثة الخام قد تحمل ما يدل على الهوية، فلا يراها المختص؛
-- يرى الملف المرتب (case_files) فقط.
drop policy if exists case_messages_select on public.case_messages;
create policy case_messages_select on public.case_messages for select to authenticated
  using (
    public.owns_case(case_id)
    or public.has_admin_role(array['super_admin', 'moderator']::public.admin_role[])
  );

drop policy if exists case_files_select on public.case_files;
create policy case_files_select on public.case_files for select to authenticated
  using (
    public.owns_case(case_id)
    or public.is_assigned_expert(case_id)
    or public.has_admin_role(array['super_admin', 'moderator']::public.admin_role[])
  );

drop policy if exists expert_answers_select on public.expert_answers;
create policy expert_answers_select on public.expert_answers for select to authenticated
  using (
    public.owns_case(case_id)
    or (expert_id = auth.uid() and public.is_assigned_expert(case_id))
    or public.has_admin_role(array['super_admin', 'moderator']::public.admin_role[])
  );

drop policy if exists feedback_missing_select on public.feedback_missing;
create policy feedback_missing_select on public.feedback_missing for select to authenticated
  using (
    (expert_id = auth.uid() and public.is_approved_expert())
    or public.has_admin_role(array['super_admin', 'moderator']::public.admin_role[])
  );

drop policy if exists guard_log_select on public.guard_log;
create policy guard_log_select on public.guard_log for select to authenticated
  using (public.has_admin_role(array['super_admin', 'moderator']::public.admin_role[]));

drop policy if exists general_queries_select on public.general_queries;
create policy general_queries_select on public.general_queries for select to authenticated
  using (public.has_admin_role(array['super_admin', 'moderator']::public.admin_role[]));

-- rate_limits: بلا سياسات عمداً (RLS مفعّل ⇒ لا وصول لأحد غير service role).

-- ---------------------------------------------------------------------
-- المخزن الخاص expert-docs: الشهادات والتزكيات.
-- خاص (غير عام)، 10 ميغابايت للملف، PDF وصور فقط.
-- يرفع المختص في مجلد باسم معرّفه فقط، ولا يقرأ أحد إلا المشرف الأعلى والمراجع.
-- (تُحذف الوثائق بعد البت في الطلب بـ30 يوماً — مهمة مجدولة في S10.)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'expert-docs', 'expert-docs', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists expert_docs_admin_read on storage.objects;
create policy expert_docs_admin_read on storage.objects for select to authenticated
  using (
    bucket_id = 'expert-docs'
    and public.has_admin_role(array['super_admin', 'reviewer']::public.admin_role[])
  );

drop policy if exists expert_docs_upload_own on storage.objects;
create policy expert_docs_upload_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'expert-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists expert_docs_admin_delete on storage.objects;
create policy expert_docs_admin_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'expert-docs'
    and public.has_admin_role(array['super_admin']::public.admin_role[])
  );

-- انتهى. تحقّق: Table Editor يجب أن يعرض 12 جدولاً، وكلها بشارة "RLS enabled".

-- ---------------------------------------------------------------------
-- تقوية إضافية (نُفّذت في القاعدة بعد S2): دوال الصلاحيات لا يستدعيها الزائر anon،
-- ومشغّل إنشاء الملف الشخصي لا يستدعيه أحد مباشرة.
-- ---------------------------------------------------------------------
revoke execute on function public.current_admin_role() from anon;
revoke execute on function public.has_admin_role(public.admin_role[]) from anon;
revoke execute on function public.is_approved_expert() from anon;
revoke execute on function public.is_assigned_expert(uuid) from anon;
revoke execute on function public.owns_case(uuid) from anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- الأذكار (S6؛ migration: 20261005_adhkar.sql). تُبنى من /api/admin/build-adhkar فقط.
-- ---------------------------------------------------------------------
create table if not exists public.adhkar (
  hadith_id    text not null,
  lang         text not null,
  occasions    text[] not null default '{}'
               check (occasions <@ array['morning', 'evening', 'after_prayer']::text[]),
  position     int not null default 0,
  title        text,
  text         text not null,
  explanation  text,
  grade        text not null check (length(trim(grade)) > 0),
  repeat_count int check (repeat_count between 1 and 1000),
  source_url   text not null check (source_url like 'https://%'),
  updated_at   timestamptz not null default now(),
  primary key (hadith_id, lang)
);
create index if not exists adhkar_lang_position_idx on public.adhkar (lang, position);
alter table public.adhkar enable row level security;
revoke all on public.adhkar from anon, authenticated;
grant select on public.adhkar to anon, authenticated;
drop policy if exists adhkar_select on public.adhkar;
create policy adhkar_select on public.adhkar for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- R5: ذاكرة الأجوبة لمدة 7 أيام (migrations/20261010_answer_cache.sql). مفتاح الخادم وحده.
-- ---------------------------------------------------------------------------
create table if not exists public.answer_cache (
  key text primary key,
  question_norm text not null,
  mode text not null default 'general' check (mode in ('general', 'new_muslim', 'discover')),
  lang text not null,
  version text not null,
  reply jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);
create index if not exists answer_cache_expires_idx on public.answer_cache (expires_at);
alter table public.answer_cache enable row level security;
revoke all on public.answer_cache from anon, authenticated;
