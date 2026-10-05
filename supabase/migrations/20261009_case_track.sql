-- =====================================================================
-- مُستفتي — R3: مسار المسألة (track) للمحادثتين الموجّهتين.
-- يُنفَّذ مرة واحدة في Supabase ← SQL Editor ← New query ← Run. آمن لإعادة التشغيل.
--
--   general     ← المحادثة العامة في الرئيسية (الافتراضي، وكل المسائل السابقة).
--   new_muslim  ← «المرشد» في /new-muslim: تُوجَّه إلى المختصين بدور mentor.
--   discover    ← «الداعية» في /discover: تُوجَّه إلى المختصين بدور daee.
-- إن لم يوجد مختص معتمد بالدور المطلوب تُوجَّه إلى mufti مع ملاحظة في ملف المسألة (lib/case/routing.ts).
-- قبل تنفيذه: تُحفظ المسائل بلا العمود (والتوجيه بالدور صحيح)، ولا يظهر فلتر المسار.
-- =====================================================================

alter table public.cases add column if not exists track text not null default 'general';

alter table public.cases drop constraint if exists cases_track_check;
alter table public.cases
  add constraint cases_track_check check (track in ('general', 'new_muslim', 'discover'));

create index if not exists cases_track_idx on public.cases (track);

-- المسجّل يقرأ أعمدة بعينها من cases (لا الرمز السري ولا البريد): يُضاف المسار إليها.
grant select (track) on public.cases to authenticated;
