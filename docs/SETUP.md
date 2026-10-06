# دليل التشغيل المحلي للجنة التحكيم · Local Setup Guide for the Judges

> [English version below](#english)

هذا الدليل يشغّل مُستفتي على جهازك بمفاتيحك أنت، في نحو 30 دقيقة. الموقع الحي: [www.mustafti.com](https://www.mustafti.com).

## أ. المتطلبات

| المتطلب | ملاحظة |
|---|---|
| **Node.js 20 أو أحدث** (والمُختبَر 22) | https://nodejs.org |
| **npm** | يأتي مع Node |
| **حساب Supabase مجاني** | https://supabase.com/dashboard — قاعدة البيانات والدخول |
| **حساب OpenRouter** برصيد صغير | https://openrouter.ai — مزوّد النموذج اللغوي |
| Git | لتنزيل المستودع |

## ب. متغيرات البيئة

كلها في [`.env.example`](../.env.example) بقيم وهمية. «إلزامي» = لا تعمل المحادثة أو الدخول دونه.

| المتغير | ما هو | من أين يُحصل عليه | إلزامي؟ | قيمة مقترحة للتجربة |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | رابط مشروع Supabase | Supabase ← **Project Settings** ← **API** (أو **Data API**): **Project URL** — `https://supabase.com/dashboard/project/<ref>/settings/api` | نعم | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | المفتاح العام للمتصفح | الصفحة نفسها ← **API Keys**: **anon public** (أو **Publishable key** `sb_publishable_…`) | نعم | — |
| `SUPABASE_SERVICE_ROLE_KEY` | مفتاح الخادم (يتجاوز RLS) — **سري** | الصفحة نفسها: **service_role** (أو **Secret key** `sb_secret_…`) ← **Reveal** | نعم | — |
| `OPENROUTER_API_KEY` | مفتاح المزوّد **OpenRouter** | https://openrouter.ai/keys ← **Create Key** (يُفضَّل بحد إنفاق) | نعم | `sk-or-v1-…` |
| `LLM_MODEL` | النموذج الأساسي. **لا قيمة افتراضية في الكود** (`lib/llm.ts`) | معرّف من https://openrouter.ai/models | نعم | `openai/gpt-6-luna` |
| `LLM_FALLBACK_MODEL` | نموذج احتياطي مرة واحدة عند تعطل الأساسي أو انتهاء المهلة | كالسابق | لا | `google/gemma-4-31b-it` |
| `LLM_REASONING` | `off` يطفئ معامل التفكير كله | — | لا | فارغ |
| `LLM_REASONING_CLASSIFY` / `_RERANK` / `_ANSWER` | جهد التفكير لكل مهمة: `minimal`، `low`، `medium`، `high`، `off` (الافتراضي `low`) | — | لا | `low` |
| `FEATURE_WEB_TOOLS` | طبقة «ابحث واقرأ» (أدوات OpenRouter). `false` يطفئها | — | لا | `true` |
| `DAILY_LLM_LIMIT` | الحد اليومي لطلبات النموذج (يوم UTC، عدّاد في Supabase) | — | لا | `1500` |
| `MCP_URL` | خادم المحتوى الإسلامي الرسمي للمسابقة. **مفتوح بلا مفتاح** (لا يرسل الكود أي ترويسة مصادقة، `lib/mcp.ts`) | https://mcp.islamiccontent.org | لا (هذا الافتراضي في الكود) | `https://mcp.islamiccontent.org/mcp` |
| `ISLAMHOUSE_API_KEY` | المفتاح **العام** الموثّق لواجهة IslamHouse (ليس سراً) | https://developers.islamhouse.com | لا (الافتراضي في الكود) | `paV29H2gm56kvLPy` |
| `ADMIN_EMAILS` | بريد المشرف الأعلى (أو أكثر بفواصل): يُعطى `super_admin` عند أول دخول | — | لا (لازم للوحة) | `admin@mustafti.com` |
| `ADMIN_PATH` | كلمة سرية لمسار لوحة المشرف: `/ar/<ADMIN_PATH>` | اخترها أنت | لا (لازم للوحة) | `judges-panel-2026` |
| `DEMO_NO_MFA_EMAILS` | مشرفون تجريبيون يدخلون اللوحة **بلا MFA** مع شريط «حساب تجريبي». لا أثر لها إلا لحساب له دور في `admins` | — | لا | `admin@mustafti.com` |
| `DEMO_LOGIN` | `true` يُظهر أزرار «دخول تجريبي» في صفحة الدخول | — | لا | `true` |
| `DEMO_ACCOUNTS_PASSWORD` | كلمة المرور المشتركة للحسابات التجريبية الثلاثة (تضعها أنت عند إنشائها) | اخترها أنت | مع `DEMO_LOGIN` | كلمة قوية من اختيارك |

**تغيير النموذج:** الكود يخاطب OpenRouter بواجهة متوافقة مع **OpenAI Chat Completions** (`lib/llm.ts`)، فأي نموذج على OpenRouter يعمل بتغيير `LLM_MODEL` وحده (مثل `google/gemma-4-31b-it` أو `google/gemini-2.5-flash`). وطبقة «ابحث واقرأ» تحتاج نموذجاً يدعم أدوات OpenRouter؛ إن لم يدعمها فاجعل `FEATURE_WEB_TOOLS=false` وتبقى المصادر الأخرى.

## ج. خطوات التشغيل

### 1) التنزيل والتثبيت

```bash
git clone https://github.com/hamdibozkurt1453/mustafti.git
cd mustafti
npm install
cp .env.example .env.local   # ثم املأ القيم (القسم ب)
```

### 2) قاعدة البيانات (Supabase ← SQL Editor ← New query ← Run)

نفّذ الملفات **بهذا الترتيب**، كل ملف في استعلام مستقل (كلها آمنة لإعادة التشغيل):

1. `supabase/schema.sql` — الجداول والأدوار وسياسات RLS.
2. `supabase/bayyinat.sql` — جدول «بيّنات» (تعتمد عليه migration البحث فيه).
3. كل ملفات `supabase/migrations/` **مرتبة بالاسم** (الاسم يبدأ بالتاريخ `YYYYMMDD`)، من `20261004_expert_profiles.sql` إلى `20261015_adhkar_public_read.sql`. لعرض الترتيب: `ls supabase/migrations`.

ثم في **Authentication ← URL Configuration** أضف `http://localhost:3000/**` إلى **Redirect URLs**. (تفاصيل الإعداد للإنتاج: [setup-supabase.md](setup-supabase.md).)

### 3) الحسابات التجريبية الثلاثة

في **Authentication ← Users ← Add user ← Create new user** أنشئ هذه الثلاثة، وفعّل **Auto Confirm User**، وضع لكل منها كلمة المرور نفسها التي في `DEMO_ACCOUNTS_PASSWORD`:

| الدور | البريد |
|---|---|
| مستخدم | `user@mustafti.com` |
| مختص | `specialized@mustafti.com` |
| مشرف أعلى | `admin@mustafti.com` |

ثم عيّن الأدوار بهذا الاستعلام (في SQL Editor):

```sql
-- المختص: مقبول (approved) بدور «مفتٍ»
insert into public.experts (id, role, status, languages, specialty, pledge_at, decided_at)
select id, 'mufti', 'approved', '{ar,en}', 'الفقه العام', now(), now()
from auth.users where email = 'specialized@mustafti.com'
on conflict (id) do update set status = 'approved', role = 'mufti';

-- المشرف الأعلى (ويُعطاه أيضاً تلقائياً إن كان بريده في ADMIN_EMAILS)
insert into public.admins (id, role)
select id, 'super_admin' from auth.users where email = 'admin@mustafti.com'
on conflict (id) do update set role = 'super_admin';
```

> الملف الشخصي (`profiles`) يُنشأ تلقائياً عند إنشاء المستخدم (المشغّل `on_auth_user_created`). المستخدم العادي لا يحتاج شيئاً آخر.

### 4) التشغيل

```bash
npm run dev     # http://localhost:3000 ← يحوّل إلى /ar
npm test        # الاختبارات (اختياري)
npm run build   # بناء الإنتاج (اختياري)
```

ادخل من `/ar/login` بأزرار «دخول تجريبي»، ولوحة المشرف على `/ar/<ADMIN_PATH>`.
حالة المنصة والمصادر: `/api/health`.

## د. استيراد البيانات (اختياري)

**المحادثة تعمل دون أي استيراد**: تعتمد على المصادر الحية (القسم هـ). الاستيراد يضيف مصادر محلية أسرع فقط.

| البيانات | كيف | الملاحظة |
|---|---|---|
| **فتاوى «الإسلام سؤال وجواب»** | ادخل مشرفاً أعلى، ثم افتح `/api/admin/import-islamqa` واضغط «استيراد» وأبقِ الصفحة مفتوحة | من المجموعة العامة [`kingkaung/islamqainfo_parallel_corpus`](https://huggingface.co/datasets/kingkaung/islamqainfo_parallel_corpus) على Hugging Face، ترخيص **CC BY-NC 4.0** مع الإسناد. دفعات من 100، وتكمل من حيث توقفت |
| **بيّنات** (dawa.center/file/7937) | نزّل الملف يدوياً من المتصفح (ممنوع على الزواحف في robots.txt)، ثم `npm run index-bayyinat -- --file <المسار>` للتجربة، وأضف `--write` للكتابة | الملف لا يُرفع إلى المستودع |
| **الأذكار** | البذرة الثابتة بتخريجها داخل `supabase/migrations/20261014_adhkar_timed.sql` (تُحمَّل مع الخطوة 2). ولأذكار الموسوعة الكاملة: `/api/admin/build-adhkar` ← «ابنِ الأذكار» | البناء عبر خادم MCP |

## هـ. المصادر الخارجية وكيف يُوصل إليها

| المصدر | الوصول | مفتاح؟ |
|---|---|---|
| **خادم MCP الرسمي** (القرآن والتفسير والحديث وIslamHouse) | `https://mcp.islamiccontent.org/mcp` عبر Streamable HTTP من الخادم (`lib/mcp.ts`) | لا |
| **IslamHouse API** (المكتبة) | الواجهة الرسمية من الخادم بالمفتاح العام (`lib/library/`) | عام |
| **الدرر السنية** | من **متصفح السائل** مباشرة (`dorar.net/dorar_api.json`)، لأنها تحجب خوادم السحابة | لا |
| **«ابحث واقرأ»** | أداتا OpenRouter `web_search` و`web_fetch` تعملان من خوادم المزوّد، محصورتين في **17 نطاقاً** من المرجعية: islamqa.info، binbaz.org.sa، binothaimeen.net، bohoth.awqaf.gov.kw، byenah.com، dawa.center، dorar.net، hadeethenc.com، islamenc.com، islamhouse.com، islamic-content.com، quranenc.com، quranpedia.net، risala.prh.gov.sa، shamela.ws، tafsir.net، terminologyenc.com (`lib/sources/registry.ts`). الكود يحذف كل رابط خارجها، ولا يقبل اقتباساً إلا إن وُجد حرفياً فيما قرأته الأداة | مفتاح OpenRouter |
| قواعد Supabase المحلية | IslamQA وبيّنات والأذكار (القسم د) | مفاتيح Supabase |

القائمة الكاملة بقواعد كل مصدر: [خريطة-المرجعية-RAG.md](خريطة-المرجعية-RAG.md) و[SOURCES.md](../SOURCES.md).

## و. ماذا تجرّب

1. **الأسئلة الأربعة المقترحة:** على الصفحة الرئيسية `/ar` تحت المحادثة أزرار «أسئلة مقترحة» (مثل «ما فضل صلاة الفجر في جماعة؟»، «ما معنى آية الكرسي؟»). اضغط أحدها وانظر: الجواب يُبث، والإشارات [n] تفتح المصدر الأصلي. وتختلف الأسئلة في `/ar/new-muslim` و`/ar/discover`. جرّب أيضاً سؤالاً عن حالة شخصية (مثل «طلّقت زوجتي وأنا غضبان فهل وقع؟») لترى الاستيضاح ثم الإحالة إلى مختص.
2. **`/ar/eval`:** صفحة الشفافية: كيف يعمل مُستفتي، وما لا يفعله، ورابط المستودع.
3. **فحص المصادر:** ادخل بـ `admin@mustafti.com`، ثم افتح `/api/admin/sources-probe`، واكتب سؤالاً: تظهر عبارات البحث، ثم كل مصدر على حدة بالتوازي (الحالة، والزمن، وعدد النتائج، وأول 3 نتائج بدرجة صلتها). لا يُحفظ شيء.

---

<a id="english"></a>

# English

This guide runs Mustafti on your machine with your own keys in about 30 minutes. Live site: [www.mustafti.com](https://www.mustafti.com).

## A. Requirements

- **Node.js 20+** (tested on 22) and **npm** — https://nodejs.org
- A free **Supabase** account — https://supabase.com/dashboard (database + auth)
- An **OpenRouter** account with a small balance — https://openrouter.ai (LLM provider)
- Git

## B. Environment variables

All are listed in [`.env.example`](../.env.example) with placeholder values.

| Variable | What it is | Where to get it | Required | Suggested value |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase → **Project Settings** → **API** (or **Data API**): **Project URL** — `https://supabase.com/dashboard/project/<ref>/settings/api` | Yes | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public browser key | Same page → **API Keys**: **anon public** (or **Publishable key** `sb_publishable_…`) | Yes | — |
| `SUPABASE_SERVICE_ROLE_KEY` | Server key (bypasses RLS) — **secret** | Same page: **service_role** (or **Secret key** `sb_secret_…`) → **Reveal** | Yes | — |
| `OPENROUTER_API_KEY` | Provider key (**OpenRouter**) | https://openrouter.ai/keys → **Create Key** (set a spend limit) | Yes | `sk-or-v1-…` |
| `LLM_MODEL` | Primary model. **No default in code** (`lib/llm.ts`) | Any id from https://openrouter.ai/models | Yes | `openai/gpt-6-luna` |
| `LLM_FALLBACK_MODEL` | Used once if the primary fails or times out | Same | No | `google/gemma-4-31b-it` |
| `LLM_REASONING` | `off` disables the reasoning parameter entirely | — | No | empty |
| `LLM_REASONING_CLASSIFY` / `_RERANK` / `_ANSWER` | Per-task reasoning effort: `minimal`, `low`, `medium`, `high`, `off` (default `low`) | — | No | `low` |
| `FEATURE_WEB_TOOLS` | "Search & read" layer (OpenRouter tools). `false` disables it | — | No | `true` |
| `DAILY_LLM_LIMIT` | Daily LLM request cap (UTC day, counter in Supabase) | — | No | `1500` |
| `MCP_URL` | The challenge's official Islamic content server. **Open, no key** (the code sends no auth header, `lib/mcp.ts`) | https://mcp.islamiccontent.org | No (code default) | `https://mcp.islamiccontent.org/mcp` |
| `ISLAMHOUSE_API_KEY` | IslamHouse's documented **public** key (not a secret) | https://developers.islamhouse.com | No (code default) | `paV29H2gm56kvLPy` |
| `ADMIN_EMAILS` | Super-admin email(s), comma-separated; granted `super_admin` on first sign-in | — | For the admin panel | `admin@mustafti.com` |
| `ADMIN_PATH` | Secret slug for the admin panel: `/en/<ADMIN_PATH>` | Pick one | For the admin panel | `judges-panel-2026` |
| `DEMO_NO_MFA_EMAILS` | Demo admins who enter the panel **without MFA** (with a "demo account" bar). Only affects accounts with a row in `admins` | — | No | `admin@mustafti.com` |
| `DEMO_LOGIN` | `true` shows "demo sign-in" buttons on the login page | — | No | `true` |
| `DEMO_ACCOUNTS_PASSWORD` | Shared password of the three demo accounts (you set it when creating them) | Pick one | With `DEMO_LOGIN` | a strong password of your choice |

**Switching models:** the code talks to OpenRouter through an **OpenAI Chat Completions–compatible** API (`lib/llm.ts`), so any OpenRouter model works by changing `LLM_MODEL` alone. The "search & read" layer needs a model that supports OpenRouter tools; otherwise set `FEATURE_WEB_TOOLS=false` and the other sources keep working.

## C. Running it

```bash
git clone https://github.com/hamdibozkurt1453/mustafti.git
cd mustafti
npm install
cp .env.example .env.local   # then fill in the values (section B)
```

**Database** (Supabase → SQL Editor → New query → Run), each file as its own query, **in this order** (all re-runnable):

1. `supabase/schema.sql` — tables, roles, RLS policies.
2. `supabase/bayyinat.sql` — the Bayyinat table (a later migration depends on it).
3. Every file in `supabase/migrations/`, **sorted by name** (names start with the date `YYYYMMDD`), from `20261004_expert_profiles.sql` to `20261015_adhkar_public_read.sql` (`ls supabase/migrations` shows the order).

Then add `http://localhost:3000/**` under **Authentication → URL Configuration → Redirect URLs**.

**Demo accounts:** in **Authentication → Users → Add user → Create new user**, create `user@mustafti.com` (user), `specialized@mustafti.com` (specialist) and `admin@mustafti.com` (super admin), tick **Auto Confirm User**, and give each the same password as `DEMO_ACCOUNTS_PASSWORD`. Then assign roles with the SQL in section ج above (it is plain SQL, identical in both languages). Profiles are created automatically by the `on_auth_user_created` trigger.

```bash
npm run dev     # http://localhost:3000 → redirects to /ar (switch to /en from the header)
```

Sign in at `/en/login` with the demo buttons; the admin panel is at `/en/<ADMIN_PATH>`; platform status at `/api/health`.

## D. Importing data (optional)

**Chat works without any import** — it relies on the live sources (section E). Imports only add faster local sources.

- **IslamQA fatwas:** sign in as super admin, open `/api/admin/import-islamqa`, press the import button and keep the page open. Source: the public Hugging Face dataset [`kingkaung/islamqainfo_parallel_corpus`](https://huggingface.co/datasets/kingkaung/islamqainfo_parallel_corpus), **CC BY-NC 4.0** with attribution. Batches of 100, resumable.
- **Bayyinat** (dawa.center/file/7937): download the file manually in a browser (its robots.txt disallows crawlers), then `npm run index-bayyinat -- --file <path>` (dry run) and add `--write` to save. The file is never committed.
- **Adhkar:** the fixed, referenced seed ships inside `supabase/migrations/20261014_adhkar_timed.sql` (loaded in step C). For the full encyclopedia set: `/api/admin/build-adhkar` (built via the MCP server).

## E. External sources and how they are reached

| Source | Access | Key? |
|---|---|---|
| **Official MCP server** (Quran, tafsir, hadith, IslamHouse) | `https://mcp.islamiccontent.org/mcp` over Streamable HTTP from the server (`lib/mcp.ts`) | No |
| **IslamHouse API** (library) | Official API from the server with the public key (`lib/library/`) | Public |
| **Dorar** (hadith grading) | Directly from the **user's browser** (`dorar.net/dorar_api.json`), since it blocks cloud servers | No |
| **"Search & read"** | OpenRouter's `web_search` and `web_fetch` tools run on the provider's servers, restricted to **17 reference domains** (listed in the Arabic section; `lib/sources/registry.ts`). The code drops any other link and accepts a quote only if it appears verbatim in what the tool read | OpenRouter key |
| Local Supabase tables | IslamQA, Bayyinat, adhkar (section D) | Supabase keys |

Per-source rules: [خريطة-المرجعية-RAG.md](خريطة-المرجعية-RAG.md) and [SOURCES.md](../SOURCES.md).

## F. What to try

1. **The four suggested questions:** on the home page (`/en` or `/ar`) under the chat, press one of the "suggested questions" buttons. The answer streams in and each [n] links to the original source. `/new-muslim` and `/discover` have their own suggestions. Also try a personal-case question (e.g. "I divorced my wife while angry — did it count?") to see clarification followed by referral to a specialist.
2. **`/en/eval`:** the transparency page — how Mustafti works, what it does not do, and the repository link.
3. **Source probe:** sign in as `admin@mustafti.com`, open `/api/admin/sources-probe`, type a question: you get the search phrases, then every source in parallel (status, latency, result count, top 3 results with relevance scores). Nothing is stored.
