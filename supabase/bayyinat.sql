-- =====================================================================
-- مُستفتي — جدول «بيّنات: أسئلة وأجوبة عن الإسلام» (dawa.center/file/7937)
-- المرجعية: «مصدر أساسي للحلول الحوارية في الشبهات» (ص 4).
-- يُملأ مرة واحدة بالسكربت scripts/index-bayyinat.ts من نسخة نزّلها حمدي يدوياً
-- (رابط التنزيل ممنوع على الزواحف في robots.txt، فلا تنزيل آلي).
-- نفّذه في Supabase ← SQL Editor ← New query ← Run. آمن لإعادة التنفيذ.
-- =====================================================================

create table if not exists public.bayyinat (
  number      int primary key,                -- رقم السؤال في «بيّنات»
  question    text not null,
  answer      text not null,
  source_url  text not null default 'https://dawa.center/file/7937',
  page        int,                            -- صفحة السؤال في الملف (إن عُرفت)
  lang        text not null default 'ar',
  -- بحث نصي بسيط (البحث بالمعنى عبر pgvector يُضاف حين يُعتمد نموذج التضمين).
  fts         tsvector generated always as (
                to_tsvector('simple', coalesce(question, '') || ' ' || coalesce(answer, ''))
              ) stored,
  created_at  timestamptz not null default now()
);

create index if not exists bayyinat_fts_idx on public.bayyinat using gin (fts);

-- محتوى منشور للعموم: القراءة مسموحة، والكتابة للخادم وحده (service role يتجاوز RLS).
alter table public.bayyinat enable row level security;

drop policy if exists bayyinat_public_read on public.bayyinat;
create policy bayyinat_public_read on public.bayyinat for select to anon, authenticated using (true);

revoke insert, update, delete on public.bayyinat from anon, authenticated;
