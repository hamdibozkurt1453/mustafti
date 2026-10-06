# الأمن في مُستفتي (S13)

مراجعة محافظة قبل التسليم: لا تغيير في أي ميزة أو سلوك مرئي للمستخدم.

## منفّذ

| البند | التفصيل |
|---|---|
| HTTPS | عبر Vercel لكل النطاقات، مع `Strict-Transport-Security: max-age=63072000; includeSubDomains` |
| ترويسات أمنية (`next.config.ts`) | `X-Content-Type-Options: nosniff`، و`Referrer-Policy: strict-origin-when-cross-origin`، و`X-Frame-Options: SAMEORIGIN`، و`Permissions-Policy: camera=(), microphone=(), geolocation=()` (الموقع للمواقيت يأتي من ترويسات Vercel في `/api/geo`، لا من المتصفح) |
| كلمات المرور | يحفظها Supabase Auth مجزّأة بـ bcrypt، ولا تمر بقاعدة بيانات التطبيق |
| RLS | سياسات Row Level Security على كل الجداول (`supabase/schema.sql` و`supabase/migrations/`): القراءة بسياسات، والكتابة عبر الخادم بعد `requireRole()`، والأعمدة الحساسة (`secret_token_hash`، `contact_email`) محجوبة بامتيازات الأعمدة |
| المشرفون | مسار سري `ADMIN_PATH` يعيد 404 لغير المشرف، وMFA (‏`aal2`) شرط للدور في الكود وفي القاعدة (`current_admin_role()`)، وفحص الدور في الخادم لكل طلب، وسجل `admin_audit` |
| مفتاح service role | في `lib/supabase/admin.ts` مع `import "server-only"`؛ أي استيراد من مكوّن عميل يُفشل البناء |
| حدود الطلبات | `/api/chat` (30/ساعة لكل IP)، ومسارات الحالة، وبحث المكتبة (60/ساعة)، و`/api/demo-login` (10 كل 10 دقائق، S13). يُخزَّن HMAC للعنوان لا العنوان. وحد يومي لطلبات النموذج `DAILY_LLM_LIMIT` |
| `/api/demo-login` | معطّل (404) إلا مع `DEMO_LOGIN=true` وكلمة مرور في متغير بيئة؛ يقبل الأدوار الثلاثة فقط (`user` / `specialized` / `admin` ← ثلاثة عناوين ثابتة في `lib/demo/rules.ts`، بـ `Object.hasOwn`)؛ من الأصل نفسه فقط؛ وحد طلبات؛ ولا يرجع إلا `{ ok }` |
| رسائل الخطأ | مسارات API العامة ترجع رموزاً عامة (`bad_request`، `unavailable`، `rate_limited`، `generic`…) وتسجّل التفصيل بـ `console.error` فقط. أخطاء النموذج تظهر للمستخدم برسالة ثابتة لا تذكر النموذج ولا المزوّد (`llmUserMessage`). وفي S13 صار نص خطأ النموذج الداخلي في `/api/health` للمشرف الأعلى وحده |
| الأسرار | `.gitignore` يشمل `.env` و`.env.*` و`.env*` و`*.pem` (و`.env.local` تحته؛ والمستثنى `.env.example` وحده، بلا قيم سرية). فُحص سجل git كله: لا ملف أسرار ولا مفتاح بصيغة معروفة |
| رمز متابعة الحالة | يُخزَّن بصمة SHA-256 فقط، ويظهر للسائل مرة واحدة |

### ملاحظات مقصودة

- **صفحات أدوات المشرف** (`/api/admin/*`: brain-test، وcase-test، وsources-probe، وimport-islamqa، وbuild-adhkar، وmodel-test) تعرض نص الخطأ الخام عمداً لأنها أدوات تشخيص، ولا يصلها إلا `super_admin` بعد MFA (`requireRole`).
- **`/api/health`** عام، ويعرض حالة المصادر الخارجية العامة وأخطاء الاتصال بها (مهلة، HTTP 403…) لأنها معلومات عن مواقع عامة لا عن المنصة. اسم النموذج ونص خطئه للمشرف الأعلى وحده.
- `*.local` عامةً غير مدرج في `.gitignore`؛ ما يهم منه (`.env.local`) مغطى بـ `.env.*`. لم نضفه حتى لا نتجاهل ملفاً مقصوداً.

## npm audit (6 أكتوبر 2026)

`npm audit fix` بلا `--force` لا يغيّر شيئاً. المتبقي: **5 ثغرات high** في سلسلة واحدة
`braces ← micromatch ← fast-glob ← @next/eslint-plugin-next ← eslint-config-next`، وهي **أدوات تطوير فقط**
(فحص الكود)، لا تدخل في حزمة الإنتاج. إصلاحها المقترح (`--force`) يخفض `eslint-config-next` إلى 14.x (تغيير كبير
يكسر الإعداد)، فتُرك حتى يصدر إصلاح متوافق من Next.js.

## مؤجل

| البند | السبب / الخطة |
|---|---|
| CSP صارم | يحتاج قائمة دقيقة لـ YouTube (iframe)، وGoogle Fonts، وSupabase، وIslamHouse، وسكربتات Next.js؛ يُبدأ بـ `Content-Security-Policy-Report-Only` ثم يُفرض |
| CAPTCHA | على التسجيل وإرسال الحالة والنشرة البريدية (مثل Cloudflare Turnstile) |
| سياسة كلمات المرور | طول أدنى أكبر وفحص كلمات مسرّبة في إعدادات Supabase Auth |
| تسجيل مركزي | تجميع السجلات والتنبيهات (Vercel Log Drains أو ما يماثلها) بدل `console.error` وحده |
| حذف الدخول التجريبي | `/api/demo-login` للعرض فقط ويُحذف بعد المسابقة (F5) |
