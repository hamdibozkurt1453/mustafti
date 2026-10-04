-- =====================================================================
-- مُستفتي — دور «viewer» لحساب لجنة التحكيم (S10).
-- يُنفَّذ مرة واحدة في Supabase ← SQL Editor ← New query ← Run. آمن لإعادة التشغيل.
--
-- إضافة قيمة إلى النوع admin_role فقط. لا تغيير في سياسات RLS: لا سياسة تذكر viewer،
-- فلا يقرأ بجلسته شيئاً من الجداول. اللوحة تقرأ في الخادم بمفتاح service role بعد فحص الدور،
-- وتعرض له التبويبات للاطلاع فقط (بلا أزرار، ولا وثائق، ولا وسائل تواصل)، وكل فعل يرفضه الخادم.
--
-- إعطاء الدور (من جدول admins فقط، بعد أن يسجّل الحساب دخوله مرة):
--   insert into public.admins (id, role)
--   select id, 'viewer' from public.profiles where email = 'judges@example.com'
--   on conflict (id) do update set role = excluded.role;
-- =====================================================================

alter type public.admin_role add value if not exists 'viewer';
