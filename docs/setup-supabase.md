# إعداد Supabase لمُستفتي — خطوة بخطوة

مدة التنفيذ: نحو 15 دقيقة. تحتاج: حساب Supabase، وحساب Vercel، وتطبيق مصادقة على هاتفك (Google Authenticator أو Microsoft Authenticator أو 1Password).

> **قاعدة ذهبية:** المفاتيح تُلصق في Vercel فقط (وفي `.env.local` على جهازك إن شغّلت الموقع محلياً). لا تلصق أي مفتاح في GitHub أبداً.

---

## 1) أنشئ المشروع (إن لم يكن موجوداً)

1. افتح https://supabase.com/dashboard وسجّل الدخول.
2. اضغط **New project**.
3. **Name:** `mustafti` · **Database Password:** اضغط **Generate a password** واحفظها في مكان آمن · **Region:** الأقرب إليك (مثل Frankfurt).
4. اضغط **Create new project** وانتظر دقيقة حتى يجهز.

## 2) أنشئ الجداول والصلاحيات (مرة واحدة)

1. افتح ملف `supabase/schema.sql` من المستودع على GitHub، واضغط زر **Copy raw file** (أيقونة النسخ أعلى الملف).
2. في Supabase، من القائمة اليسرى: **SQL Editor** ← **New query**.
3. الصق النص كله في المحرر، ثم اضغط **Run** (أسفل اليمين).
4. يجب أن تظهر رسالة **Success. No rows returned**.
   - إن ظهرت نافذة تحذير عن "destructive operations" فاضغط **Run this query** (الملف آمن ويمكن إعادة تشغيله).

**تحقّق:**
- **Table Editor**: 12 جدولاً (`profiles`، `experts`، `admins`، `admin_audit`، `cases`، `case_messages`، `case_files`، `expert_answers`، `feedback_missing`، `guard_log`، `general_queries`، `rate_limits`)، ولا يظهر بجانب أيٍّ منها تحذير **RLS disabled**.
- **Storage**: مخزن اسمه `expert-docs` وعليه علامة **Private**.

## 3) إعداد الدخول

### 3.1 البريد وكلمة المرور والرابط السحري
1. **Authentication** ← **Sign In / Providers** (أو **Providers**) ← **Email**.
2. تأكد أن **Enable Email provider** مفعّل.
3. تأكد أن **Confirm email** **مفعّل** — مهم جداً: لا يصبح أحد مشرفاً إلا ببريد مؤكَّد.
4. اضغط **Save**.

> الرابط السحري يعمل تلقائياً مع مزوّد البريد. خدمة البريد المجانية في Supabase ترسل عدداً قليلاً من الرسائل في الساعة، لذلك الدخول بكلمة المرور هو الأساسي.

### 3.2 Google (معطّل الآن)
لا تفعل شيئاً. الدخول بـ Google معطّل في الكود عمداً لأنه يحتاج مفتاحاً من Google Cloud.

### 3.3 المصادقة الثنائية (MFA)
1. **Authentication** ← **Multi-Factor** (أو **MFA**).
2. تأكد أن **TOTP (App Authenticator)** مفعّل (Enabled). اضغط **Save** إن غيّرت شيئاً.

### 3.4 روابط الموقع
1. **Authentication** ← **URL Configuration**.
2. **Site URL:** اكتب `https://mustafti.vercel.app` ← **Save** (وبعد ربط النطاق غيّره إلى `https://mustafti.com`).
3. **Redirect URLs** ← **Add URL**، وأضف هذه واحداً واحداً:
   - `https://mustafti.vercel.app/**`
   - `https://mustafti.com/**` (للنطاق بعد ربطه)
   - `http://localhost:3000/**` (للتشغيل على جهازك)
   - رابط معاينات Vercel: افتح أي نشر معاينة في Vercel وانسخ أوله. إن كان مثلاً `https://mustafti-abc123-hamdis-projects.vercel.app` فأضف `https://mustafti-*-hamdis-projects.vercel.app/**` (ضع اسم فريقك الحقيقي مكان `hamdis-projects`).

## 4) انسخ المفاتيح إلى Vercel

### 4.1 من Supabase
**Project Settings** (الترس أسفل اليسار) ← **API Keys** (أو **API** في الواجهة القديمة):

| ما تنسخه من Supabase | اسمه في Vercel |
|---|---|
| **Project URL** (في **Data API** أو أعلى صفحة API، يبدأ بـ `https://` وينتهي بـ `.supabase.co`) | `NEXT_PUBLIC_SUPABASE_URL` |
| مفتاح **anon public** (أو **Publishable key** الذي يبدأ بـ `sb_publishable_`) | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| مفتاح **service_role** (أو **Secret key** الذي يبدأ بـ `sb_secret_`) — اضغط **Reveal** ثم انسخ | `SUPABASE_SERVICE_ROLE_KEY` ⚠️ **سري جداً** |

### 4.2 في Vercel
1. افتح https://vercel.com ← مشروع **mustafti** ← **Settings** ← **Environment Variables**.
2. لكل متغير: اكتب الاسم في **Key**، والقيمة في **Value**، واختر **Production** و**Preview** معاً، ثم **Save**:

| Key | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | مفتاح anon / publishable |
| `SUPABASE_SERVICE_ROLE_KEY` | مفتاح service_role / secret — فعّل خيار **Sensitive** |
| `ADMIN_EMAILS` | بريدك (ولأكثر من بريد افصل بفاصلة: `a@x.com,b@y.com`) |
| `ADMIN_PATH` | كلمة سرية غير متوقعة لرابط اللوحة، أحرف إنجليزية صغيرة وأرقام وشرطة، مثل `ops-7f3k9q` |

3. **Deployments** ← آخر نشر ← زر النقاط الثلاث **⋯** ← **Redeploy** ← **Redeploy**. (المتغيرات لا تُطبَّق إلا بعد إعادة النشر.)

## 5) جرّب

1. افتح `https://mustafti.vercel.app/ar/register` وأنشئ حساباً **ببريدك نفسه الذي وضعته في `ADMIN_EMAILS`**، بكلمة مرور قوية.
2. افتح بريدك واضغط رابط التأكيد (قد يكون في Spam). ستدخل تلقائياً إلى صفحة «حسابك».
   - إن لم تصل الرسالة: Supabase ← **Authentication** ← **Users** ← بريدك ← **⋯** ← **Send magic link**، أو انتظر قليلاً (حد البريد المجاني).
3. افتح `https://mustafti.vercel.app/ar/<ADMIN_PATH>` (الكلمة السرية التي اخترتها).
4. سيظهر رمز QR: افتح تطبيق المصادقة ← **+** ← **Scan QR code** ← امسح الرمز، ثم اكتب الأرقام الستة ← **تحقّق**.
5. تظهر «لوحة المشرف» ودورك: **مشرف أعلى**. ✅
6. في كل دخول لاحق للوحة يطلب الرمز من التطبيق فقط.

**اختبارات الحماية:**
- افتح `https://mustafti.vercel.app/ar/<ADMIN_PATH>` من نافذة متخفية (بلا دخول) ← يجب أن تظهر **الصفحة غير موجودة**.
- أنشئ حساباً ثانياً ببريد آخر وافتح الرابط نفسه ← **الصفحة غير موجودة**.
- `https://mustafti.vercel.app/ar/me` بلا دخول ← يحوّلك إلى صفحة الدخول.

## مشكلات شائعة

| المشكلة | الحل |
|---|---|
| «الحسابات قيد الإعداد» عند الدخول | المتغيرات غير موجودة في Vercel، أو لم تُعِد النشر (الخطوة 4.2). |
| الرابط في البريد يفتح صفحة الدخول مع «الرابط غير صالح» | أضف روابط الموقع (الخطوة 3.4)، ثم اطلب رابطاً جديداً. |
| فتحت رابط البريد على جهاز أو متصفح آخر فظهر «الرابط غير صالح» | افتح الرابط في المتصفح نفسه الذي طلبته منه. حسابك تأكّد على أي حال، فادخل بكلمة المرور. |
| اللوحة تعطي 404 وأنت المشرف | تأكد أن `ADMIN_EMAILS` يطابق بريدك تماماً، ثم **سجّل الخروج وادخل من جديد** (يُعطى الدور عند الدخول)، وتأكد من إعادة النشر. |
| فقدت هاتفك (تطبيق المصادقة) | Supabase ← **SQL Editor** ← نفّذ: `delete from auth.mfa_factors where user_id = (select id from auth.users where email = 'بريدك');` ثم افتح اللوحة وسجّل التطبيق من جديد. |
| إضافة مشرف آخر يدوياً (حتى تُبنى صفحة المشرفين في S10) | بعد أن ينشئ حسابه: **SQL Editor** ← `insert into public.admins (id, role) select id, 'reviewer' from auth.users where email = 'بريده';` (الأدوار: `super_admin` أو `reviewer` أو `moderator`). |
