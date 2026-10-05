-- =====================================================================
-- مُستفتي — تحسين البحث في «بيّنات» (R1b).
-- يُنفَّذ يدوياً مرة واحدة في Supabase ← SQL Editor ← New query ← Run. آمن لإعادة التشغيل.
--
-- المشكلة: search_bayyinat (أُنشئت يدوياً) تعيد نتائج غير متعلقة بالسؤال، لأنها تطابق أي كلمة
-- (حتى «ما» و«هل» و«في») بلا تطبيع للعربية.
-- الحل:
--   1) ar_normalize: تطبيع العربية (حذف التشكيل والتطويل، والهمزات ألفاً، والتاء المربوطة هاءً،
--      والألف المقصورة ياءً، و ؤ/ئ واواً وياءً، وكل ما ليس حرفاً أو رقماً مسافة).
--   2) ar_query_words: كلمات السؤال بعد التطبيع، بلا أدوات الاستفهام والحروف، وبلا «ال» والواو
--      المتصلة في الكلمات الطويلة، و3 حروف فأكثر.
--   3) عمودان مطبَّعان (السؤال، والسؤال مع الجواب) بفهارس pg_trgm.
--   4) search_bayyinat(q, n): الترتيب بالتغطية (كم كلمة من السؤال في سؤال «بيّنات» ثم في جوابه)
--      وبالتشابه (word_similarity من pg_trgm)، مع حد أدنى يمنع النتائج غير المتعلقة.
-- الرد بالأعمدة نفسها التي يقرؤها الكود (number, question, answer, page, source_url, score).
-- =====================================================================

create extension if not exists pg_trgm;

create or replace function public.ar_normalize(t text)
returns text
language sql
immutable
parallel safe
as $$
  select btrim(regexp_replace(
    translate(
      regexp_replace(lower(coalesce(t, '')), '[ًٌٍَُِّْٰـ]', '', 'g'),
      'أإآٱةىؤئ',
      'ااااهيوي'
    ),
    '[^0-9a-zء-ي٠-٩ٱ-ۓ]+', ' ', 'g'
  ))
$$;

create or replace function public.ar_query_words(q text)
returns text[]
language sql
immutable
parallel safe
as $$
  select coalesce(array_agg(distinct w), '{}')
  from (
    select case
             when length(x) >= 5 then regexp_replace(x, '^(وال|فال|بال|كال|لل|ال)', '')
             else x
           end as w
    from unnest(string_to_array(public.ar_normalize(q), ' ')) as x
  ) s
  where length(w) >= 3
    and w not in (
      'ماذا', 'لماذا', 'كيف', 'متي', 'اين', 'هل', 'الذي', 'التي', 'الذين', 'هذا', 'هذه', 'ذلك', 'تلك',
      'علي', 'الي', 'عن', 'في', 'من', 'ما', 'لا', 'لم', 'لن', 'قد', 'ان', 'او', 'ثم', 'كل', 'بين', 'مع',
      'عند', 'غير', 'بعد', 'قبل', 'حتي', 'اذا', 'لماذ', 'هناك', 'ليس', 'كان', 'يكون', 'تكون', 'انه', 'انها',
      'نحن', 'انتم', 'هم', 'هو', 'هي', 'لكن', 'لان', 'بان', 'وما', 'وهل', 'فما', 'يعني',
      'what', 'why', 'how', 'who', 'the', 'and', 'are', 'does'
    )
$$;

alter table public.bayyinat
  add column if not exists question_norm text generated always as (public.ar_normalize(question)) stored;
alter table public.bayyinat
  add column if not exists full_norm text generated always as (public.ar_normalize(question || ' ' || answer)) stored;

create index if not exists bayyinat_question_norm_trgm on public.bayyinat using gin (question_norm gin_trgm_ops);
create index if not exists bayyinat_full_norm_trgm on public.bayyinat using gin (full_norm gin_trgm_ops);

drop function if exists public.search_bayyinat(text, integer);

create or replace function public.search_bayyinat(q text, n integer default 5)
returns table (number integer, question text, answer text, page integer, source_url text, score real)
language sql
stable
as $$
  with qw as (
    select public.ar_query_words(q) as words,
           array_to_string(public.ar_query_words(q), ' ') as phrase
  ),
  scored as (
    select b.number, b.question, b.answer, b.page, b.source_url,
           -- التغطية: كلمة في سؤال «بيّنات» بوزن 2، وفي جوابه وحده بوزن 1، من 3 لكل كلمة.
           (
             select coalesce(sum(case
                                   when b.question_norm like '%' || w || '%' then 3
                                   when b.full_norm like '%' || w || '%' then 1
                                   else 0
                                 end), 0)::real
             from unnest(qw.words) as w
           ) / greatest(3 * cardinality(qw.words), 1) as coverage,
           greatest(word_similarity(qw.phrase, b.question_norm), similarity(qw.phrase, b.question_norm))::real as sim
    from public.bayyinat b, qw
    where cardinality(qw.words) > 0
  )
  select number, question, answer, page, source_url, (0.65 * coverage + 0.35 * sim)::real as score
  from scored
  -- حد أدنى: ثلث كلمات السؤال في سؤال «بيّنات» تقريباً، أو تشابه حروف واضح.
  where coverage >= 0.34 or sim >= 0.45
  order by 0.65 * coverage + 0.35 * sim desc, number
  limit greatest(1, least(coalesce(n, 5), 20))
$$;

revoke all on function public.search_bayyinat(text, integer) from public;
grant execute on function public.search_bayyinat(text, integer) to service_role;
