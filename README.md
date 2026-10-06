<p align="center">
  <img src="brand/logo-stacked-on-light.svg" alt="مُستفتي · Mustafti" width="320">
</p>

# مُستفتي · Mustafti

**مُستفتي يستوضح السؤال الشرعي ولا يُفتي.** يجيب عن الأسئلة العامة عن الإسلام بأي لغة، ويقوّي جوابه بنصوص
خادم MCP الرسمي للجمعية والمصادر المعتمدة في المرجعية مع روابطها. وإن كان السؤال عن حالة شخصية، يستوضحه ثم
يحيله ملفاً بلا هوية إلى مختص موثَّق.

🔗 **https://mustafti.com** · مشاركة في **تحدي الذكاء الاصطناعي في خدمة المحتوى الإسلامي 2026** —
**المسار 01: الحوار المعرفي والإجابات الموثوقة**.

> [English version below](#english)

## المسارات الثلاثة

| المسار | لمن | الصفحة |
|---|---|---|
| **اسأل عن عبادتك ويومك** | المسلم يسأل عن صلاته وصيامه وزكاته ومعاملاته | الرئيسية والمحادثة |
| **رفيق أيامك الأولى** | من أسلم حديثاً: الطهارة، والصلاة الأولى، ومعنى الشهادتين خطوة بخطوة | `/new-muslim` |
| **تعرّف على الإسلام من مصادره** | غير المسلم يسأل بحرية ويأخذ الجواب من النص نفسه | `/discover` |

## الميزات

- **المحادثة بالمصادر:** جواب كامل بشخصية مسلمة حسب الصفحة، مع إشارات [n] إلى الآيات والأحاديث والفتاوى المنشورة وروابطها الأصلية، وبث فوري، وسجل «محادثاتي» للمسجّلين.
- **الحالة الشخصية والمختصون:** الأسئلة عن واقعة فردية تُستوضح (أسئلة «لماذا نسأل؟») ثم تُحال ملفاً مرتباً بلا هوية إلى مختص يُقبل يدوياً بعد التحقق من شهاداته أو تزكياته، ويتابعها السائل برابط سري.
- **«الحوار» (المنتدى):** نقاش محترم ومُراقَب بالتصنيفات.
- **المكتبة:** كتب IslamHouse عبر واجهتها الرسمية، بحثاً وتصنيفاً، بلغة الواجهة.
- **المواقيت والأذكار:** مواقيت الصلاة بمكتبة adhan حسب الموقع، والأذكار الموقوتة وبالفئات.
- **لوحة المشرفين:** على مسار سري (`ADMIN_PATH`) مع تحقق بخطوتين وفحص الدور في الخادم لكل طلب.

## البنية

| الطبقة | التقنية |
|---|---|
| الواجهة والخادم | Next.js (App Router) + TypeScript + Tailwind CSS، وnext-intl (العربية افتراضية، والإنجليزية) |
| الحسابات والبيانات | Supabase: Auth، وPostgres، وسياسات RLS، ومخزن خاص |
| الاستضافة | Vercel (HTTPS) |
| النصوص الشرعية | خادم MCP الرسمي للجمعية `https://mcp.islamiccontent.org/mcp` (بلا مفتاح) |
| المكتبة | IslamHouse API الرسمية |
| النموذج اللغوي | عبر `lib/llm.ts`، والنموذج من متغير البيئة `LLM_MODEL` (قابل للتبديل) |

## المصادر

ترتيب الوصول: خادم MCP أولاً، ثم واجهة برمجية عامة، ثم البحث المباشر في الموقع بأدب واحترام robots.txt. لا بحث ويب عام.
التفصيل والتراخيص في [SOURCES.md](SOURCES.md).

| المصدر | الموقع | الوصول |
|---|---|---|
| موسوعة القرآن الكريم | https://quranenc.com | mcp + api |
| موسوعة الأحاديث النبوية | https://hadeethenc.com | mcp |
| موقع بيان الإسلام | https://byenah.com | site |
| موقع دار الإسلام (IslamHouse) | https://islamhouse.com | mcp |
| موسوعة المحتوى الإسلامي باللغات | https://islamenc.com/ar | رابط فقط |
| موسوعة المصطلحات الإسلامية | https://terminologyenc.com | رابط فقط |
| القاعدة المركزية للمحتوى الإسلامي باللغات | https://icadb.com | رابط فقط |
| رسالة الحرمين | https://risala.prh.gov.sa | api |
| المستودع الدعوي الرقمي (ومنه «بيّنات») | https://dawa.center | رابط فقط |
| الجمهرة — موسوعة مفردات المحتوى الإسلامي | https://islamic-content.com | رابط فقط |
| موسوعة القرآن (Quranpedia) | https://quranpedia.net | api |
| مجمع الملك فهد لطباعة المصحف الشريف | https://qurancomplex.gov.sa | رابط فقط |
| الدرر السنية — الموسوعة الحديثية | https://dorar.net/hadith | رابط فقط |
| الدرر السنية — موسوعة التفسير | https://dorar.net/tafseer | رابط فقط |
| الدرر السنية — الموسوعة العقدية | https://dorar.net/aqeeda | رابط فقط |
| الدرر السنية — الموسوعة الفقهية | https://dorar.net/feqhia | رابط فقط |
| الدرر السنية — الموسوعة التاريخية | https://dorar.net/history | رابط فقط |
| المكتبة الشاملة | https://shamela.ws | رابط فقط |
| مركز تفسير للدراسات القرآنية | https://tafsir.net | site |
| التفسير الموضوعي (مركز تفسير) | https://modoee.com | رابط فقط |
| مصحف سورة | https://surahapp.com | رابط فقط |
| وحي | https://wahy.net | رابط فقط |
| المكتبة الصوتية للقرآن الكريم | https://mp3quran.net | api |
| الموسوعة الفقهية الكويتية | https://bohoth.awqaf.gov.kw | رابط فقط |
| الإسلام سؤال وجواب | https://islamqa.info | رابط فقط |
| موقع الشيخ عبدالعزيز بن باز | https://binbaz.org.sa | رابط فقط |
| موقع الشيخ محمد بن صالح العثيمين | https://binothaimeen.net | رابط فقط |
| مجمع الملك سلمان العالمي للغة العربية (معجم الرياض، وسوار، وفلك) | https://ksaa.gov.sa | رابط فقط |
| الإسلام سؤال وجواب (نسخة محلية) | [kingkaung/islamqainfo_parallel_corpus](https://huggingface.co/datasets/kingkaung/islamqainfo_parallel_corpus) | محلي — CC BY-NC 4.0 |
| بيّنات (الحزمة العلمية) | https://dawa.center/file/7937 | محلي |

## مبدأ «الحارس»

المساعد يجيب بعلمه بحرية، والمصادر تقوّي جوابه حيث تُوجد. ولا يتدخل الحارس إلا في ثلاث حالات
([docs/decisions.md](docs/decisions.md)، القرار R5c):

1. **نص منسوب لا يطابق مصدراً:** إن نُسبت آية أو حديث أو قول عالم ولم يطابق نصاً مسترجعاً، يُصحَّح إلى نص المصدر، أو يُذكر بمعناه بلا نسبة («ورد في السنة ما معناه…»). فلا حديث مختلق ولا رقم مختلق.
2. **فتوى شخصية لحالة فردية:** لا يقول مُستفتي «طلاقك واقع» أو «صلاتك باطلة»؛ يستوضح ثم يحيل إلى مختص.
3. **ذكر اسم النموذج أو الشركة المزوّدة، أو كلام مسيء:** تُحذف الجملة وحدها. مُستفتي يعرّف نفسه دائماً بـ«مُستفتي».

وما عدا ذلك (الشرح، والخطوات، والأذكار، والأحكام العامة المعروفة) يمر كاملاً.

## التشغيل محلياً

```bash
npm install
cp .env.example .env.local   # ثم املأ القيم
npm run dev                  # http://localhost:3000 ← يحوّل إلى /ar
npm test                     # الاختبارات
npm run build                # بناء الإنتاج
```

إعداد Supabase: [docs/setup-supabase.md](docs/setup-supabase.md) (`supabase/schema.sql` ثم `supabase/migrations/`).

### متغيرات البيئة

الأسماء فقط؛ القيم في `.env.local` محلياً وفي Vercel للإنتاج، ولا أسرار في المستودع. القائمة الكاملة بشرحها في [`.env.example`](.env.example).

| المجموعة | المتغيرات |
|---|---|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`، `NEXT_PUBLIC_SUPABASE_ANON_KEY`، `SUPABASE_SERVICE_ROLE_KEY` |
| النموذج اللغوي | مفتاح المزوّد (اسمه في `.env.example`)، `LLM_MODEL`، `LLM_FALLBACK_MODEL`، `LLM_REASONING*`، `DAILY_LLM_LIMIT`، `FEATURE_WEB_TOOLS` |
| المصادر | `MCP_URL`، `ISLAMHOUSE_API_KEY` |
| الإدارة | `ADMIN_EMAILS`، `ADMIN_PATH`، `DEMO_NO_MFA_EMAILS` |
| الدخول التجريبي | `DEMO_LOGIN`، `DEMO_ACCOUNTS_PASSWORD` |

### حسابات التجربة (للجنة التحكيم)

أزرار «دخول تجريبي» في صفحة الدخول (حين يكون `DEMO_LOGIN=true`). كلمة المرور تُسلَّم للجنة مع التسليم، ولا تُكتب هنا.

| الدور | البريد |
|---|---|
| مستخدم | `user@mustafti.com` |
| مختص | `specialized@mustafti.com` |
| مشرف | `admin@mustafti.com` |

الحالة الحية للمنصة والمصادر: [mustafti.com/api/health](https://mustafti.com/api/health). الأمن: [docs/security.md](docs/security.md).

## بنية المستودع

| المسار | المحتوى |
|---|---|
| `app/[locale]/` | الصفحات لكل لغة |
| `components/` | الرأس، والقائمة، وزر اللغة، وشريط الإفصاح، والتذييل، والمحادثة |
| `i18n/` · `messages/` | إعداد اللغات وملفات الترجمة |
| `proxy.ts` | توجيه الزائر إلى مسار لغته وتجديد جلسة الدخول |
| `supabase/schema.sql` | الجداول والفهارس وسياسات RLS والمخزن الخاص |
| `lib/supabase/` · `lib/auth/` | عملاء Supabase، والدخول، والأدوار، والمشرف الأول |
| `lib/llm.ts` · `lib/mcp.ts` · `lib/sources/` | النموذج اللغوي، وخادم MCP، وموصّلات مصادر المرجعية |
| `app/api/health/` | صفحة حالة المنصة والمصادر |
| `scripts/model-test.ts` · `lib/model-test.ts` | اختبار المقارنة بين النماذج |
| `scripts/index-bayyinat.ts` · `supabase/bayyinat.sql` | فهرسة «بيّنات» من نسخة منزّلة يدوياً (الملف لا يُرفع) |
| `docs/` | الخطة والمواصفات وخريطة المرجعية والقرارات |
| `brand/` · `public/brand/` | الشعارات والهوية |

## تاريخ البناء

أُنشئ المستودع فارغاً في 3 أكتوبر 2026، وأُعدّت قبل التحدي المواصفات والهوية البصرية (مجلدا docs وbrand). وكُتب كل كود المنصة بين 4 و6 أكتوبر 2026، كما يظهر في سجل التعديلات (commits).

## التراخيص

- الكود: [LICENSE](LICENSE) — جميع الحقوق محفوظة، ليس مفتوح المصدر.
- المكتبات والخطوط: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) · الإشعارات: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- المصادر والبيانات: [SOURCES.md](SOURCES.md) (فتاوى «الإسلام سؤال وجواب» تحت CC BY-NC 4.0 مع الإسناد).

---

<a id="english"></a>

## English

**Mustafti clarifies religious questions — it never issues fatwas.** It answers general questions about Islam
in any language, backed by the official association MCP server and the approved reference sources, with links.
Personal cases are clarified, then referred as an anonymous, structured file to a verified specialist.

🔗 **https://mustafti.com** · Entry to the **AI in the Service of Islamic Content Challenge 2026** — **Track 01:
Knowledge Dialogue & Trustworthy Answers**.

### Three paths
- **Ask about your worship and daily life** — home page chat.
- **Companion for your first days** (`/new-muslim`) — purification, first prayer, the meaning of the testimony, step by step.
- **Discover Islam from its sources** (`/discover`) — for non-Muslims, answers from the texts themselves.

### Features
Source-backed chat with [n] citations and original links · clarification and anonymous referral to manually
verified specialists · moderated forum («الحوار») · IslamHouse library · prayer times (adhan) and adhkar ·
admin dashboard on a secret path with MFA and server-side role checks.

### Architecture
Next.js (App Router) + TypeScript + Tailwind · Supabase (Auth, Postgres, RLS) · Vercel (HTTPS) · official MCP
server `mcp.islamiccontent.org/mcp` · IslamHouse API · a swappable language model behind `lib/llm.ts` (`LLM_MODEL`).

### Sources
MCP first, then public APIs, then polite on-site search respecting robots.txt — no general web search. Full
table above and in [SOURCES.md](SOURCES.md). The IslamQA dataset `kingkaung/islamqainfo_parallel_corpus` is
used under CC BY-NC 4.0.

### The guard principle (decision R5c)
The assistant answers freely from its knowledge; sources strengthen the answer where available. The guard
intervenes only for: (1) attributed text (verse, hadith, scholar quote) that does not match a retrieved
source — corrected or rephrased as meaning without attribution; (2) a personal fatwa for an individual case —
blocked and referred to a specialist; (3) naming the underlying model or provider, or offensive content — that
sentence alone is removed.

### Run locally
```bash
npm install && cp .env.example .env.local   # fill in values
npm run dev    # http://localhost:3000
npm test && npm run build
```
Environment variable names are listed (without values) in [`.env.example`](.env.example) and in the table above.

### Demo accounts
`user@mustafti.com` · `specialized@mustafti.com` · `admin@mustafti.com` — via the demo-login buttons when
`DEMO_LOGIN=true`. The password is provided to the judges separately.

### Licenses
Code: [LICENSE](LICENSE) (all rights reserved — not open source). Third parties:
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Security: [docs/security.md](docs/security.md).

---

جميع الحقوق محفوظة © حمدي بوزكورت 2026. يُسمح للجنة تحكيم تحدي الذكاء الاصطناعي في خدمة المحتوى الإسلامي بتشغيل الكود وتقييمه، ولا يُسمح بنسخه أو استعماله لغير ذلك دون إذن كتابي.
