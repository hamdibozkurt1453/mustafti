-- =====================================================================
-- مُستفتي — فتاوى «الإسلام سؤال وجواب» محلياً (R1d).
-- يُنفَّذ يدوياً مرة واحدة في Supabase ← SQL Editor ← New query ← Run، بعد
-- 20261006_bayyinat_search.sql (يستعمل الدالة public.ar_normalize منه). آمن لإعادة التشغيل.
--
-- المصدر: المجموعة العامة kingkaung/islamqainfo_parallel_corpus على Hugging Face
-- (19.1 ألف سؤال وجواب من islamqa.info، ترخيص CC BY-NC 4.0). الاستيراد من صفحة المشرف
-- /api/admin/import-islamqa (upsert بـ original_id).
--
-- المحفوظ (توفيراً للمساحة):
--   العربية والإنجليزية كاملتين: title وquestion وanswer (مقطوعاً عند 8000 حرف) وlink.
--   tr وfr وid وur وbn وru: title وquestion وlink فقط (لا عمود للأردية في المجموعة الحالية؛
--   الأعمدة جاهزة إن أُضيفت).
-- البحث: عمودان مطبَّعان (العنوان والسؤال بالعربية، ونظيرهما بالإنجليزية) بفهارس pg_trgm،
-- والدالة search_islamqa(q, lang, n) على نمط search_bayyinat: التغطية والتشابه بحد أدنى.
-- RLS مفعّل بلا سياسات: لا قراءة عامة؛ القراءة بمفتاح الخادم (service_role) وحده.
-- =====================================================================

create extension if not exists pg_trgm;

do $$
begin
  if to_regprocedure('public.ar_normalize(text)') is null then
    raise exception 'نفّذ أولاً 20261006_bayyinat_search.sql (الدالة public.ar_normalize)';
  end if;
end $$;

create table if not exists public.islamqa_fatwas (
  original_id text primary key,
  topic text,
  title_ar text,
  question_ar text,
  answer_ar text,
  link_ar text,
  title_en text,
  question_en text,
  answer_en text,
  link_en text,
  title_tr text, question_tr text, link_tr text,
  title_fr text, question_fr text, link_fr text,
  title_id text, question_id text, link_id text,
  title_ur text, question_ur text, link_ur text,
  title_bn text, question_bn text, link_bn text,
  title_ru text, question_ru text, link_ru text,
  ar_norm text generated always as (public.ar_normalize(coalesce(title_ar, '') || ' ' || coalesce(question_ar, ''))) stored,
  en_norm text generated always as (public.ar_normalize(coalesce(title_en, '') || ' ' || coalesce(question_en, ''))) stored,
  imported_at timestamptz not null default now()
);

create index if not exists islamqa_ar_norm_trgm on public.islamqa_fatwas using gin (ar_norm gin_trgm_ops);
create index if not exists islamqa_en_norm_trgm on public.islamqa_fatwas using gin (en_norm gin_trgm_ops);

alter table public.islamqa_fatwas enable row level security;
revoke all on table public.islamqa_fatwas from anon, authenticated;
grant all on table public.islamqa_fatwas to service_role;

-- كلمات البحث: ar_query_words (من migration «بيّنات»)، بلا الكلمات العامة التي في أغلب العناوين
-- («حكم»، "ruling")، وصيغة الجمع الإنجليزية بلا s ("mortgages" ← "mortgage"، والمطابقة جزئية).
create or replace function public.islamqa_query_words(q text)
returns text[]
language sql
immutable
parallel safe
as $$
  select coalesce(array_agg(distinct w), '{}')
  from (
    select case when x ~ '^[a-z]{5,}s$' then left(x, -1) else x end as w
    from unnest(public.ar_query_words(q)) as x
  ) s
  where w not in (
    'حكم', 'يجوز', 'جواز', 'مسلم', 'اسلام', 'شرعا',
    'ruling', 'rule', 'islam', 'islamic', 'permissible', 'allowed', 'this', 'that', 'there', 'with', 'from',
    'about', 'have', 'when', 'which', 'should', 'can', 'for', 'not', 'any', 'his', 'her', 'their'
  )
$$;

drop function if exists public.search_islamqa(text, text, integer);

-- lang: 'en' يبحث في العمود الإنجليزي، وغيره في العربي (عبارات البحث العربية من المصنّف لكل اللغات).
-- الرد: العربية والإنجليزية كاملتين، وعناوين اللغات الأخرى وروابطها (يختار الكود رابط لغة السائل).
create or replace function public.search_islamqa(q text, lang text default 'ar', n integer default 5)
returns table (
  original_id text,
  topic text,
  title_ar text, question_ar text, answer_ar text, link_ar text,
  title_en text, question_en text, answer_en text, link_en text,
  titles jsonb,
  links jsonb,
  score real
)
language sql
stable
as $$
  with qw as (
    select public.islamqa_query_words(q) as words,
           array_to_string(public.islamqa_query_words(q), ' ') as phrase
  ),
  scored as (
    select f.*,
           (
             select count(*)::real
             from unnest(qw.words) as w
             where (case when lang = 'en' then f.en_norm else f.ar_norm end) like '%' || w || '%'
           ) / greatest(cardinality(qw.words), 1) as coverage,
           greatest(
             word_similarity(qw.phrase, case when lang = 'en' then f.en_norm else f.ar_norm end),
             similarity(qw.phrase, case when lang = 'en' then f.en_norm else f.ar_norm end)
           )::real as sim
    from public.islamqa_fatwas f, qw
    where cardinality(qw.words) > 0
  )
  select original_id, topic,
         title_ar, question_ar, answer_ar, link_ar,
         title_en, question_en, answer_en, link_en,
         jsonb_strip_nulls(jsonb_build_object('tr', title_tr, 'fr', title_fr, 'id', title_id, 'ur', title_ur, 'bn', title_bn, 'ru', title_ru)) as titles,
         jsonb_strip_nulls(jsonb_build_object('tr', link_tr, 'fr', link_fr, 'id', link_id, 'ur', link_ur, 'bn', link_bn, 'ru', link_ru)) as links,
         (0.7 * coverage + 0.3 * sim)::real as score
  from scored
  -- حد أدنى: نصف كلمات السؤال في العنوان والسؤال المنشور، أو تشابه حروف واضح.
  where coverage >= 0.5 or sim >= 0.5
  order by 0.7 * coverage + 0.3 * sim desc, original_id
  limit greatest(1, least(coalesce(n, 5), 20))
$$;

revoke all on function public.search_islamqa(text, text, integer) from public;
grant execute on function public.search_islamqa(text, text, integer) to service_role;
revoke all on function public.islamqa_query_words(text) from public;
grant execute on function public.islamqa_query_words(text) to service_role;
