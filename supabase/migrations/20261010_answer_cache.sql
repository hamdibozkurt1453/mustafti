-- =====================================================================
-- مُستفتي — R5: ذاكرة الأجوبة (answer_cache) لمدة 7 أيام.
-- يُنفَّذ مرة واحدة في Supabase ← SQL Editor ← New query ← Run. آمن لإعادة التشغيل.
--
-- السؤال المكرر (بالوضع واللغة نفسيهما) يُجاب فوراً من هنا (lib/brain/answer-cache.ts):
--   key           ← sha256(النسخة | الوضع | اللغة | السؤال موحَّداً)
--   question_norm ← السؤال بلا تشكيل ولا علامات (للتشخيص فقط)
--   mode          ← general | new_muslim | discover
--   reply         ← الجواب ومصادره (بلا بيانات السائل، وبلا سياق محادثة)
-- القراءة والكتابة بمفتاح الخادم وحده: RLS مفعّل بلا سياسات (لا وصول للعموم ولا للمسجّلين).
-- قبل تنفيذه: تعمل المحادثة كما هي (الذاكرة داخل نسخة الخادم فقط)، والخطأ يُتجاهل.
-- =====================================================================

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

-- تنظيف المنتهي (يُستدعى يدوياً أو بجدولة pg_cron إن وُجدت): select public.purge_answer_cache();
create or replace function public.purge_answer_cache() returns integer
language sql
security definer
set search_path = public
as $$
  with gone as (delete from public.answer_cache where expires_at < now() returning 1)
  select count(*)::integer from gone;
$$;

revoke all on function public.purge_answer_cache() from public, anon, authenticated;
