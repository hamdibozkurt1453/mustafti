-- =====================================================================
-- مُستفتي — F1: «الصورة والنبذة» لكل حساب (المستخدم والمشرف)، كالتي عند المختص.
-- يُنفَّذ مرة واحدة في Supabase ← SQL Editor ← New query ← Run. آمن لإعادة التشغيل.
--
-- avatar_path: مسار الصورة في المخزن العام expert-avatars تحت مجلد صاحبها {user_id}/
--   (سياسات المخزن الحالية تسمح لكل مستخدم مسجّل بمجلده وحده، فلا مخزن جديد).
-- bio: نبذة قصيرة حتى 300 حرف.
-- قبل تنفيذه: قسم «الصورة والنبذة» يظهر، والحفظ يعيد رسالة «غير متاح الآن»، والصورة تبقى الحرف الأول.
-- =====================================================================

alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists bio text;

alter table public.profiles drop constraint if exists profiles_bio_length;
alter table public.profiles add constraint profiles_bio_length check (bio is null or char_length(bio) <= 300);

alter table public.profiles drop constraint if exists profiles_avatar_path_own;
alter table public.profiles add constraint profiles_avatar_path_own
  check (avatar_path is null or avatar_path like id::text || '/avatar-%');

-- المستخدم يعدّل صورته ونبذته (مع تفضيلاته السابقة)، بسياسة profiles_update_own (صفّه فقط).
grant update (avatar_path, bio) on public.profiles to authenticated;
