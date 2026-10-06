-- =====================================================================
-- مُستفتي — F3: أبواب «الحوار» في جدول forum_categories بدل القيد الثابت.
-- يُنفَّذ مرة واحدة في Supabase ← SQL Editor ← New query ← Run، بعد 20261011_forum.sql. آمن لإعادة التشغيل.
--
--   forum_categories ← slug (المعرّف في الرابط ?cat=)، وname (jsonb بأسماء اللغات الاثنتي عشرة)،
--                      و"order" (ترتيب العرض)، وactive (المعطّل لا يُكتب فيه موضوع جديد، وتبقى مواضيعه).
--   البذرة: الأبواب الستة السابقة + سيرة، تفسير، حديث، أخلاق، دعوة، تاريخ إسلامي، لغة عربية
--           (تطابق lib/forum/categories-data.ts).
--   التحويل: forum_threads.category يصير مفتاحاً خارجياً إلى forum_categories(slug) بدل قيد check،
--            وأي قيمة غير معروفة تتحول إلى general.
--   الإضافة والتعطيل والترتيب من لوحة المشرف (super_admin) بمفتاح الخادم، ولا كتابة للعموم.
--   وحذف رد (moderator فأعلى) يُنقص عدد الردود عبر المشغّل.
-- =====================================================================

create table if not exists public.forum_categories (
  slug       text primary key check (slug ~ '^[a-z][a-z0-9_]{1,31}$'),
  name       jsonb not null check (jsonb_typeof(name) = 'object' and name ? 'ar'),
  "order"    integer not null default 500,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists forum_categories_order_idx on public.forum_categories ("order", slug);

-- البذرة: لا تكتب فوق باب موجود (ربما عدّل المشرف اسمه أو ترتيبه).
insert into public.forum_categories (slug, name, "order", active) values
  ('aqeedah', '{"ar":"عقيدة","en":"Creed","id":"Akidah","ur":"عقیدہ","bn":"আকিদা","tr":"Akaid","fa":"عقیده","fr":"Croyance","ms":"Akidah","ru":"Вероубеждение","sw":"Itikadi","ha":"Aƙida"}'::jsonb, 10, true),
  ('ibadat', '{"ar":"عبادات","en":"Worship","id":"Ibadah","ur":"عبادات","bn":"ইবাদত","tr":"İbadetler","fa":"عبادات","fr":"Adoration","ms":"Ibadah","ru":"Поклонение","sw":"Ibada","ha":"Ibada"}'::jsonb, 20, true),
  ('muamalat', '{"ar":"معاملات","en":"Transactions","id":"Muamalah","ur":"معاملات","bn":"মুআমালাত","tr":"Muamelat","fa":"معاملات","fr":"Transactions","ms":"Muamalat","ru":"Взаимоотношения","sw":"Miamala","ha":"Mu''amala"}'::jsonb, 30, true),
  ('family', '{"ar":"أسرة","en":"Family","id":"Keluarga","ur":"خاندان","bn":"পরিবার","tr":"Aile","fa":"خانواده","fr":"Famille","ms":"Keluarga","ru":"Семья","sw":"Familia","ha":"Iyali"}'::jsonb, 40, true),
  ('new_muslim', '{"ar":"مسلم جديد","en":"New Muslim","id":"Mualaf","ur":"نیا مسلمان","bn":"নতুন মুসলিম","tr":"Yeni Müslüman","fa":"تازه‌مسلمان","fr":"Nouveau musulman","ms":"Mualaf","ru":"Новый мусульманин","sw":"Muislamu mpya","ha":"Sabon Musulmi"}'::jsonb, 50, true),
  ('seerah', '{"ar":"سيرة","en":"Seerah","id":"Sirah","ur":"سیرت","bn":"সীরাত","tr":"Siyer","fa":"سیره","fr":"Sîra","ms":"Sirah","ru":"Сира","sw":"Sira","ha":"Sira"}'::jsonb, 60, true),
  ('tafsir', '{"ar":"تفسير","en":"Tafsir","id":"Tafsir","ur":"تفسیر","bn":"তাফসীর","tr":"Tefsir","fa":"تفسیر","fr":"Exégèse","ms":"Tafsir","ru":"Тафсир","sw":"Tafsiri","ha":"Tafsiri"}'::jsonb, 70, true),
  ('hadith', '{"ar":"حديث","en":"Hadith","id":"Hadis","ur":"حدیث","bn":"হাদিস","tr":"Hadis","fa":"حدیث","fr":"Hadith","ms":"Hadis","ru":"Хадисы","sw":"Hadithi","ha":"Hadisi"}'::jsonb, 80, true),
  ('akhlaq', '{"ar":"أخلاق","en":"Character","id":"Akhlak","ur":"اخلاق","bn":"আখলাক","tr":"Ahlak","fa":"اخلاق","fr":"Éthique","ms":"Akhlak","ru":"Нравственность","sw":"Maadili","ha":"Ɗabi''u"}'::jsonb, 90, true),
  ('dawah', '{"ar":"دعوة","en":"Da''wah","id":"Dakwah","ur":"دعوت","bn":"দাওয়াহ","tr":"Davet","fa":"دعوت","fr":"Prédication","ms":"Dakwah","ru":"Призыв","sw":"Da''awa","ha":"Da''awa"}'::jsonb, 100, true),
  ('history', '{"ar":"تاريخ إسلامي","en":"Islamic history","id":"Sejarah Islam","ur":"اسلامی تاریخ","bn":"ইসলামের ইতিহাস","tr":"İslam tarihi","fa":"تاریخ اسلام","fr":"Histoire islamique","ms":"Sejarah Islam","ru":"История ислама","sw":"Historia ya Kiislamu","ha":"Tarihin Musulunci"}'::jsonb, 110, true),
  ('arabic', '{"ar":"لغة عربية","en":"Arabic language","id":"Bahasa Arab","ur":"عربی زبان","bn":"আরবি ভাষা","tr":"Arap dili","fa":"زبان عربی","fr":"Langue arabe","ms":"Bahasa Arab","ru":"Арабский язык","sw":"Lugha ya Kiarabu","ha":"Harshen Larabci"}'::jsonb, 120, true),
  ('general', '{"ar":"عام","en":"General","id":"Umum","ur":"عمومی","bn":"সাধারণ","tr":"Genel","fa":"عمومی","fr":"Général","ms":"Umum","ru":"Общее","sw":"Jumla","ha":"Gabaɗaya"}'::jsonb, 1000, true)
on conflict (slug) do nothing;

-- تحويل الموجود: أي باب غير معروف يصير «عام»، ثم القيد الثابت يصير مفتاحاً خارجياً.
update public.forum_threads t set category = 'general'
  where not exists (select 1 from public.forum_categories c where c.slug = t.category);

alter table public.forum_threads drop constraint if exists forum_threads_category_check;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'forum_threads_category_fkey') then
    alter table public.forum_threads
      add constraint forum_threads_category_fkey foreign key (category)
      references public.forum_categories (slug) on update cascade;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- الامتيازات وRLS: القراءة للجميع (حتى المعطّل، لعرض اسم باب المواضيع القديمة)، والكتابة للخادم فقط.
-- ---------------------------------------------------------------------
revoke all on public.forum_categories from anon, authenticated;
grant select on public.forum_categories to anon, authenticated;
alter table public.forum_categories enable row level security;

drop policy if exists forum_categories_select on public.forum_categories;
create policy forum_categories_select on public.forum_categories for select to anon, authenticated
  using (true);

-- موضوع جديد في باب مفعّل فقط.
drop policy if exists forum_threads_insert_own on public.forum_threads;
create policy forum_threads_insert_own on public.forum_threads for insert to authenticated
  with check (
    author_id = auth.uid() and status = 'visible' and pinned = false and replies_count = 0
    and exists (select 1 from public.forum_categories c where c.slug = category and c.active)
  );

-- ---------------------------------------------------------------------
-- حذف رد (لوحة المشرف): عدد الردود الظاهرة يتبع الحذف أيضاً.
-- ---------------------------------------------------------------------
create or replace function public.forum_post_counter()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'visible' then
      update public.forum_threads
        set replies_count = replies_count + 1, last_activity_at = new.created_at
        where id = new.thread_id;
    end if;
    return null;
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    update public.forum_threads
      set replies_count = greatest(0, replies_count + case when new.status = 'visible' then 1 else -1 end)
      where id = new.thread_id;
  elsif tg_op = 'DELETE' and old.status = 'visible' then
    update public.forum_threads
      set replies_count = greatest(0, replies_count - 1)
      where id = old.thread_id;
  end if;
  return null;
end;
$$;

revoke all on function public.forum_post_counter() from public, anon, authenticated;

drop trigger if exists forum_posts_counter on public.forum_posts;
create trigger forum_posts_counter after insert or update of status or delete on public.forum_posts
  for each row execute function public.forum_post_counter();
