-- =====================================================================
-- مُستفتي — F3: النشرة البريدية (حقل الاشتراك في التذييل).
-- يُنفَّذ مرة واحدة في Supabase ← SQL Editor ← New query ← Run. آمن لإعادة التشغيل.
--
--   newsletter_subscribers ← email (فريد، بأحرف صغيرة)، وlang (لغة الواجهة عند الاشتراك)،
--                            وcreated_at، وconfirmed (تأكيد البريد لاحقاً؛ false الآن).
--   الكتابة من مسار الخادم /api/newsletter فقط (بمفتاح الخادم بعد التحقق من الصيغة وحد السبام)،
--   والقراءة من لوحة المشرف (super_admin) فقط. لا قراءة ولا كتابة للعموم.
-- =====================================================================

create table if not exists public.newsletter_subscribers (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique check (char_length(email) between 6 and 254 and email = lower(email)),
  lang       text not null default 'ar' check (lang ~ '^[a-z]{2}$'),
  confirmed  boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists newsletter_subscribers_created_idx on public.newsletter_subscribers (created_at desc);

revoke all on public.newsletter_subscribers from anon, authenticated;
alter table public.newsletter_subscribers enable row level security;
