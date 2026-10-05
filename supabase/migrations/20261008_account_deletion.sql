-- =====================================================================
-- مُستفتي — R2: «حذف حسابي وبياناتي» دون حذف أجوبة المختصين.
-- يُنفَّذ مرة واحدة في Supabase ← SQL Editor ← New query ← Run. آمن لإعادة التشغيل.
--
-- كان expert_answers.expert_id «not null … on delete cascade»: حذف حساب مختص يحذف أجوبته من مسائل
-- السائلين. بعد هذا التغيير يبقى الجواب ويُفصل عن المختص المحذوف (expert_id = null).
-- مسائل السائل نفسه تُفصل عن حسابه أصلاً (cases.owner_id on delete set null).
-- قبل تنفيذه: الموقع يرفض حذف حساب مختص له أجوبة (رسالة لطيفة)، ولا يحذف شيئاً.
-- =====================================================================

alter table public.expert_answers alter column expert_id drop not null;

alter table public.expert_answers drop constraint if exists expert_answers_expert_id_fkey;
alter table public.expert_answers
  add constraint expert_answers_expert_id_fkey
  foreign key (expert_id) references public.experts (id) on delete set null;
