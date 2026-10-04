-- =====================================================================
-- مُستفتي — الملف الشخصي للمختص (S9، تغيير القرار: السائل يرى بطاقة المختص الذي أجابه).
-- يُنفَّذ مرة واحدة في Supabase ← SQL Editor ← New query ← Run. آمن لإعادة التشغيل.
--
-- 1) أعمدة جديدة في experts (إضافة فقط، لا تغيير لعمود قائم):
--    bio (نبذة حتى 500 حرف)، avatar_path (مسار الصورة في المخزن العام expert-avatars)،
--    contact (هاتف وبريد تواصل: للمشرفين فقط، لا يظهر للعامة أبداً)،
--    socials (x، facebook، instagram، youtube، telegram، linkedin، website)، slug (رابط الملف العام).
-- 2) مخزن عام expert-avatars: صور فقط، 2MB، والرفع والتعديل والحذف لصاحب المجلد {user_id}/ فقط.
-- =====================================================================

alter table public.experts add column if not exists bio         text;
alter table public.experts add column if not exists avatar_path text;
alter table public.experts add column if not exists contact     jsonb not null default '{}'::jsonb;
alter table public.experts add column if not exists socials     jsonb not null default '{}'::jsonb;
alter table public.experts add column if not exists slug        text;

do $$ begin
  alter table public.experts add constraint experts_slug_key unique (slug);
exception when duplicate_object or duplicate_table then null; end $$;

do $$ begin
  alter table public.experts add constraint experts_bio_len check (bio is null or char_length(bio) <= 500);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.experts add constraint experts_slug_format check (slug is null or slug ~ '^[a-z0-9][a-z0-9-]{2,63}$');
exception when duplicate_object then null; end $$;

-- رابط عام لكل طلب سابق بلا رابط.
update public.experts
set slug = 'expert-' || substr(replace(id::text, '-', ''), 1, 10)
where slug is null;

-- ---------------------------------------------------------------------
-- المخزن العام expert-avatars
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expert-avatars', 'expert-avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- القراءة العامة عبر الرابط العام (المخزن public) لا تحتاج سياسة.
-- سياسة القراءة هنا لصاحب المجلد فقط، وتلزم لاستبدال الصورة (upsert).
drop policy if exists expert_avatars_read_own on storage.objects;
create policy expert_avatars_read_own on storage.objects for select to authenticated
  using (bucket_id = 'expert-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists expert_avatars_insert_own on storage.objects;
create policy expert_avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'expert-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists expert_avatars_update_own on storage.objects;
create policy expert_avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'expert-avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'expert-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists expert_avatars_delete_own on storage.objects;
create policy expert_avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'expert-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- تحقّق: Table Editor ← experts فيه الأعمدة الخمسة، وStorage فيه expert-avatars بشارة Public.
