-- =====================================================================
-- مُستفتي — جدول الأذكار (S6).
-- يُنفَّذ مرة واحدة في Supabase ← SQL Editor ← New query ← Run. آمن لإعادة التشغيل.
--
-- يُملأ من مسار المشرف /api/admin/build-adhkar فقط (بمفتاح service role بعد فحص الدور)،
-- من موسوعة الأحاديث عبر خادم MCP الرسمي (browse_hadith_categories ثم get_hadith). لا نص مولّد.
-- صف لكل (حديث، لغة). العربية أصل: لا يُدرج حديث درجته غير «صحيح» أو «حسن».
-- القراءة عامة (الصفحة /adhkar للزوار)، ولا كتابة لأي جلسة: لا سياسة insert/update/delete.
-- =====================================================================

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
