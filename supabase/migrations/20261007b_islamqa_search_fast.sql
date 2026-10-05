-- =====================================================================
-- مُستفتي — نسخة أسرع من search_islamqa (R1e).
-- نُفّذت يدوياً في Supabase (SQL Editor) بتاريخ 6 أكتوبر 2026. هذا الملف لمزامنة المستودع
-- مع قاعدة البيانات فقط، وآمن لإعادة التشغيل. يأتي بعد 20261007_islamqa_fatwas.sql.
--
-- النسخة الأولى (sql) تحسب التغطية والتشابه على كل الصفوف (19 ألفاً): 2.6 ثانية.
-- هذه (plpgsql) تبني شرط LIKE لكل كلمة (أول 8 كلمات) بـ OR، فيستعمل فهرس pg_trgm على العمود
-- المطبَّع، ثم تحسب التغطية والتشابه على المرشحين وحدهم: 0.13 ثانية. الشرط والترتيب والأعمدة كما هي.
-- الصلاحيات: service_role وحده.
-- =====================================================================

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
language plpgsql
stable
as $$
declare
  words text[] := public.islamqa_query_words(q);
  phrase text;
  col text := case when lang = 'en' then 'en_norm' else 'ar_norm' end;
  cond text;
begin
  if coalesce(cardinality(words), 0) = 0 then
    return;
  end if;
  phrase := array_to_string(words, ' ');
  -- المرشحون: أي كلمة من أول 8 كلمات في العمود المطبَّع (فهرس pg_trgm).
  select string_agg(format('f.%I like %L', col, '%' || w || '%'), ' or ')
    into cond
    from unnest(words[1:8]) as w;

  return query execute format($f$
    with cand as (
      select f.* from public.islamqa_fatwas f where %1$s
    ),
    scored as (
      select c.*,
             (select count(*)::real from unnest($1) as w where c.%2$I like '%%' || w || '%%')
               / greatest(cardinality($1), 1) as coverage,
             greatest(word_similarity($2, c.%2$I), similarity($2, c.%2$I))::real as sim
      from cand c
    )
    select s.original_id, s.topic,
           s.title_ar, s.question_ar, s.answer_ar, s.link_ar,
           s.title_en, s.question_en, s.answer_en, s.link_en,
           jsonb_strip_nulls(jsonb_build_object('tr', s.title_tr, 'fr', s.title_fr, 'id', s.title_id, 'ur', s.title_ur, 'bn', s.title_bn, 'ru', s.title_ru)),
           jsonb_strip_nulls(jsonb_build_object('tr', s.link_tr, 'fr', s.link_fr, 'id', s.link_id, 'ur', s.link_ur, 'bn', s.link_bn, 'ru', s.link_ru)),
           (0.7 * s.coverage + 0.3 * s.sim)::real
    from scored s
    where s.coverage >= 0.5 or s.sim >= 0.5
    order by 0.7 * s.coverage + 0.3 * s.sim desc, s.original_id
    limit greatest(1, least(coalesce($3, 5), 20))
  $f$, cond, col)
  using words, phrase, n;
end
$$;

revoke all on function public.search_islamqa(text, text, integer) from public;
grant execute on function public.search_islamqa(text, text, integer) to service_role;
