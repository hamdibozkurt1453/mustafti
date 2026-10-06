import type { Locale } from "@/i18n/locales";
import type { PageContent } from "./content";

/**
 * F1b: سياسة الخصوصية الكاملة لـ /privacy. العربية والإنجليزية كاملتان، واللغات العشر مختصرة بالأقسام نفسها.
 * كل عبارة هنا مطابقة لما في الكود (التخزين المحلي للمحادثة، وجداول profiles وcases وforum_*،
 * وanswer_cache 7 أيام، وبصمة IP في rate_limits، وحذف الحساب وتنزيل البيانات في /me).
 * لا تُذكر أسماء مزوّدي الاستضافة وقاعدة البيانات والنماذج (القاعدة 2د في CLAUDE.md).
 * عند تغيير أي ممارسة: حدّث النص وPRIVACY_UPDATED معاً.
 */

export const PRIVACY_UPDATED = "2026-10-06";
export const CONTACT_EMAIL = "contact@mustafti.com";

const ar: PageContent = {
  updated: "آخر تحديث: 6 أكتوبر 2026",
  sections: [
    {
      title: "1. من نحن ومسؤول البيانات",
      paras: [
        "مُستفتي (mustafti.com) منصة تستوضح السؤال الشرعي وتجيب عن الأسئلة العامة من المصادر المعتمدة، وتحيل الحالات الشخصية إلى مختصين، ولا تُفتي. المنصة مشاركة في تحدي الذكاء الاصطناعي في خدمة المحتوى الإسلامي 2026.",
        `مسؤول البيانات: حمدي بوزكورت، مالك المنصة. للتواصل في كل ما يخص بياناتك: ${CONTACT_EMAIL}.`,
        "تشرح هذه السياسة ما نجمعه، ولماذا، ومع من نشاركه، وكم نحتفظ به، وحقوقك فيه.",
      ],
    },
    {
      title: "2. ما نجمعه",
      items: [
        "الحساب (اختياري): بريدك الإلكتروني، والاسم المعروض الذي تختاره، ولغتك المفضّلة، ومدينتك وطريقة حساب المواقيت إن اخترتهما، وصورتك ونبذتك إن أضفتهما. كلمة المرور لا نراها؛ تُحفظ مشفّرة لدى مزوّد المصادقة.",
        "المحادثات: تُحفظ في متصفحك وحده (التخزين المحلي)، للزائر والمسجّل، لا في خوادمنا. لكي نجيب، تصل رسالتك وآخر رسائل المحادثة إلى الخادم سياقاً للجواب، ولا تُحفظ باسمك. وقد يُخزَّن الجواب عن سؤال عام 7 أيام بلا أي بيانات عنك، لتسريع الجواب عن السؤال نفسه.",
        "المسائل المحالة إلى مختص: الوقائع التي تكتبها بلا اسمك، وبلدك فقط (لا عنوانك) لتوجيه المسألة إلى مختص من بلدك، والملفات التي ترفقها، وبريد المتابعة إن أدخلته، وأجوبة المختص.",
        "المنتدى («الحوار»): مواضيعك وردودك وبلاغاتك، وتُنشر المشاركات باسمك المعروض.",
        "المختصون: من يتقدّم مختصاً يرسل بيانات مؤهله ووثائق شهاداته أو تزكياته للمراجعة اليدوية، وملفه العام إن قُبل.",
        "بيانات تقنية: بصمة لعنوان IP (لا العنوان نفسه) لحد عدد الطلبات وحماية الخدمة، وسجلات الخادم التشغيلية المعتادة لدى مزوّد الاستضافة، وإحصاءات عامة بلا نص السؤال ولا هوية (اللغة، والمستوى، وعدد المصادر).",
      ],
    },
    {
      title: "3. ما لا نجمعه",
      items: [
        "لا نسأل عن هويتك الحقيقية، ولا رقم هاتفك، ولا عنوانك، ولا موقعك الدقيق. «استعمل موقعي» في بطاقة المواقيت يُحسب في متصفحك ولا يُرسل إلينا.",
        "الزائر غير المسجّل مجهول لدينا: لا حساب ولا ملف تعريف.",
        "لا إعلانات، ولا أدوات تتبّع أو تحليلات من جهات خارجية، ولا ملفات تعريف تسويقية.",
        "لا يرى المختص اسمك ولا بريدك؛ يرى وقائع المسألة فقط.",
      ],
    },
    {
      title: "4. لماذا نستخدم بياناتك",
      items: [
        "لنجيب عن سؤالك ونعرض المصادر بلغتك.",
        "لنحيل المسألة الشخصية إلى مختص مناسب ونوصل جوابه إليك.",
        "لنشغّل حسابك ومشاركاتك في المنتدى ونحفظ تفضيلاتك (اللغة والمواقيت).",
        "لنحمي الخدمة من الإساءة (حد الطلبات، وحارس المحتوى، وبلاغات المنتدى).",
        "لنحسّن جودة الأجوبة بإحصاءات عامة لا تكشف أحداً.",
        "لا نبيع بياناتك، ولا نستخدمها للإعلان، ولا نبني منها ملفاً تسويقياً.",
      ],
    },
    {
      title: "5. الأساس القانوني",
      items: [
        "تنفيذ الخدمة التي طلبتها: الجواب عن سؤالك، والحساب، وإحالة المسألة.",
        "موافقتك: البيانات الاختيارية (الصورة، والنبذة، والمدينة، وبريد المتابعة)، ولك سحبها بحذفها في أي وقت.",
        "المصلحة المشروعة: أمن الخدمة ومنع الإساءة والإحصاءات العامة المجهولة.",
        "الالتزام القانوني: إن طلبت جهة مختصة ذلك وفق القانون.",
      ],
    },
    {
      title: "6. مع من نشاركها",
      paras: ["لا نشارك بياناتك إلا مع مزوّدي خدمات يعملون نيابة عنا، وبقدر ما يلزم لتشغيل المنصة:"],
      items: [
        "مزوّد الاستضافة: يشغّل الموقع ويحفظ سجلات تشغيلية قصيرة.",
        "مزوّد قاعدة البيانات والمصادقة والتخزين: يحفظ الحساب والمسائل والمنتدى والملفات، ويرسل رسائل البريد (التأكيد وإعادة تعيين كلمة المرور).",
        "مزوّد نماذج اللغة: يتلقى نص السؤال وسياق المحادثة القريب لصياغة الجواب، بلا اسمك ولا بريدك.",
        "المختص المقبول: يتلقى ملف المسألة بلا هويتك.",
        "قد تُعالج البيانات لدى هؤلاء المزوّدين خارج بلدك، بضمانات تعاقدية معتادة.",
      ],
    },
    {
      title: "7. مدة الاحتفاظ",
      items: [
        "الحساب والملف الشخصي والصورة: حتى تحذف حسابك.",
        "المحادثة: في متصفحك حتى تمسحها («محادثة جديدة» أو مسح بيانات المتصفح).",
        "ذاكرة الأجوبة العامة: 7 أيام، بلا بيانات عن السائل.",
        "المسائل: ما دام حسابك قائماً؛ وعند الحذف تُفصل عن حسابك ويُمحى بريد المتابعة منها، وتبقى أجوبة المختصين بلا ما يدل عليك.",
        "مشاركات المنتدى: حتى تُحذف أو تُخفى؛ وعند حذف الحساب تبقى بلا اسم.",
        "وثائق المختصين: حتى حذف حساب المختص.",
        "السجلات التقنية وبصمات حد الطلبات: مدة قصيرة لأغراض الأمن والتشغيل.",
      ],
    },
    {
      title: "8. حقوقك",
      items: [
        "الوصول والتصحيح: بياناتك ظاهرة في «حسابي» وتعدّلها منه.",
        "التنزيل (قابلية النقل): «حسابي» ← «الإعدادات» ← «تنزيل بياناتي»: ملف JSON فيه حسابك ومسائلك وملفاتها والأجوبة عليها.",
        "الحذف: «حسابي» ← «الإعدادات» ← «حذف حسابي وبياناتي»، بتأكيد مزدوج، ويُنفَّذ فوراً.",
        "الاعتراض وسحب الموافقة: احذف البيانات الاختيارية أو راسلنا.",
        "لأي طلب آخر، أو للشكوى، راسلنا على البريد أدناه، ولك أن تشتكي إلى سلطة حماية البيانات في بلدك.",
      ],
      link: { label: "الإعدادات", href: "/me?tab=settings" },
    },
    {
      title: "9. ملفات الارتباط والتخزين المحلي",
      items: [
        "ملفات ارتباط ضرورية فقط: جلسة الدخول لمن سجّل. لا ملفات ارتباط إعلانية ولا تحليلية.",
        "التخزين المحلي في متصفحك: المحادثة، وإعدادات المواقيت للزائر، وإغلاق الأشرطة. لا يصل إلينا إلا ما ترسله في سؤالك.",
      ],
    },
    {
      title: "10. الأطفال",
      paras: [
        "المنصة ليست موجّهة لمن هم دون 13 عاماً، ولا نجمع بياناتهم عن علم. إن أنشأ طفل حساباً، فليتواصل وليّه معنا لحذفه.",
      ],
    },
    {
      title: "11. التغييرات على هذه السياسة",
      paras: [
        "قد نحدّث هذه السياسة عند تغيّر ممارساتنا. يظهر تاريخ آخر تحديث أعلى الصفحة، وننبّه في الموقع إلى أي تغيير جوهري قبل العمل به.",
      ],
    },
    {
      title: "12. التواصل",
      paras: [`لأي سؤال أو طلب يخص بياناتك: ${CONTACT_EMAIL}`],
      link: { label: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` },
    },
  ],
};

const en: PageContent = {
  updated: "Last updated: October 6, 2026",
  sections: [
    {
      title: "1. Who we are and the data controller",
      paras: [
        "Mustafti (mustafti.com) clarifies religious questions, answers general questions from approved sources, refers personal cases to specialists, and does not issue fatwas. It is an entry in the 2026 AI for Islamic Content Challenge.",
        `Data controller: Hamdi Bozkurt, owner of the platform. For anything about your data: ${CONTACT_EMAIL}.`,
        "This policy explains what we collect, why, whom we share it with, how long we keep it, and your rights.",
      ],
    },
    {
      title: "2. What we collect",
      items: [
        "Account (optional): your email, the display name you choose, your preferred language, your city and prayer-time method if you set them, and your photo and bio if you add them. We never see your password; it is stored hashed by the authentication provider.",
        "Chats: stored only in your browser (local storage), for visitors and signed-in users alike, not on our servers. To answer, your message and the latest messages of the chat reach the server as context and are not saved under your name. An answer to a general question may be cached for 7 days with no data about you, to answer the same question faster.",
        "Cases referred to a specialist: the facts you write without your name, your country only (not your address) to route it to a specialist from your country, any files you attach, a follow-up email if you enter one, and the specialist's answers.",
        "Forum: your topics, replies and reports; posts are published under your display name.",
        "Specialists: applicants send their qualifications and certificates or recommendations for manual review, and their public profile if accepted.",
        "Technical data: a fingerprint of your IP address (not the address itself) for rate limiting and security, the usual operational server logs at the hosting provider, and anonymous statistics without the question text (language, level, number of sources).",
      ],
    },
    {
      title: "3. What we don't collect",
      items: [
        "We don't ask for your real identity, phone number, address or precise location. \"Use my location\" on the prayer card is computed in your browser and never sent to us.",
        "A visitor who isn't signed in is anonymous to us: no account and no profile.",
        "No ads, no third-party tracking or analytics tools, no marketing profiles.",
        "A specialist never sees your name or email; only the facts of the case.",
      ],
    },
    {
      title: "4. Why we use your data",
      items: [
        "To answer your question and show the sources in your language.",
        "To refer a personal case to a suitable specialist and deliver the answer to you.",
        "To run your account and forum posts and keep your preferences (language, prayer times).",
        "To protect the service from abuse (rate limits, content guard, forum reports).",
        "To improve answer quality with anonymous statistics.",
        "We do not sell your data, use it for advertising, or build marketing profiles from it.",
      ],
    },
    {
      title: "5. Legal basis",
      items: [
        "Performing the service you asked for: answering your question, your account, referring your case.",
        "Your consent: optional data (photo, bio, city, follow-up email), which you can withdraw by deleting it at any time.",
        "Legitimate interest: service security, abuse prevention and anonymous statistics.",
        "Legal obligation: when a competent authority lawfully requires it.",
      ],
    },
    {
      title: "6. Whom we share it with",
      paras: ["We share data only with service providers acting on our behalf, and only as needed to run the platform:"],
      items: [
        "Hosting provider: runs the website and keeps short operational logs.",
        "Database, authentication and storage provider: stores accounts, cases, the forum and files, and sends emails (confirmation and password reset).",
        "Language model provider: receives the question text and recent chat context to draft the answer, without your name or email.",
        "An accepted specialist: receives the case file without your identity.",
        "These providers may process data outside your country, under standard contractual safeguards.",
      ],
    },
    {
      title: "7. Retention",
      items: [
        "Account, profile and photo: until you delete your account.",
        "Chats: in your browser until you clear them (New chat, or clearing browser data).",
        "General answer cache: 7 days, with no data about the asker.",
        "Cases: while your account exists; on deletion they are detached from your account, their follow-up email is erased, and specialists' answers remain with nothing that identifies you.",
        "Forum posts: until deleted or hidden; when you delete your account they remain without your name.",
        "Specialists' documents: until the specialist's account is deleted.",
        "Technical logs and rate-limit fingerprints: a short period for security and operations.",
      ],
    },
    {
      title: "8. Your rights",
      items: [
        "Access and correction: your data is shown in My account, where you can edit it.",
        "Download (portability): My account → Settings → Download my data: a JSON file with your account, cases, their files and the answers.",
        "Deletion: My account → Settings → Delete my account and data, with a double confirmation, effective immediately.",
        "Objection and withdrawing consent: delete the optional data or contact us.",
        "For any other request, or to complain, email us below; you may also complain to the data protection authority in your country.",
      ],
      link: { label: "Settings", href: "/me?tab=settings" },
    },
    {
      title: "9. Cookies and local storage",
      items: [
        "Essential cookies only: the sign-in session for signed-in users. No advertising or analytics cookies.",
        "Local storage in your browser: your chat, prayer settings for visitors, and dismissed banners. Nothing reaches us except what you send in a question.",
      ],
    },
    {
      title: "10. Children",
      paras: [
        "The platform is not directed at children under 13, and we do not knowingly collect their data. If a child has created an account, their parent or guardian can contact us to delete it.",
      ],
    },
    {
      title: "11. Changes to this policy",
      paras: [
        "We may update this policy when our practices change. The date of the last update is shown at the top, and we will announce any material change on the site before it takes effect.",
      ],
    },
    {
      title: "12. Contact",
      paras: [`For any question or request about your data: ${CONTACT_EMAIL}`],
      link: { label: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` },
    },
  ],
};

/** ترجمة مختصرة بالأقسام الاثني عشر نفسها: عنوان وجملة لكل قسم. */
type Brief = { updated: string; settings: string; s: [string, string][] };

function brief(b: Brief): PageContent {
  return {
    updated: b.updated,
    sections: b.s.map(([title, text], i) => ({
      title: `${i + 1}. ${title}`,
      paras: [text],
      ...(i === 7 ? { link: { label: b.settings, href: "/me?tab=settings" } } : {}),
      ...(i === 11 ? { link: { label: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` } } : {}),
    })),
  };
}

const E = CONTACT_EMAIL;

const others: Record<Exclude<Locale, "ar" | "en">, PageContent> = {
  id: brief({
    updated: "Terakhir diperbarui: 6 Oktober 2026",
    settings: "Pengaturan",
    s: [
      ["Siapa kami", `Mustafti (mustafti.com) menjawab pertanyaan umum dari sumber resmi dan tidak berfatwa. Pengendali data: Hamdi Bozkurt — ${E}.`],
      ["Yang kami kumpulkan", "Akun opsional (email, nama, bahasa, kota, foto, bio). Obrolan disimpan hanya di peramban Anda. Berkas kasus tanpa nama, hanya negara. Postingan forum dengan nama tampilan. Sidik jari IP untuk batas permintaan."],
      ["Yang tidak kami kumpulkan", "Identitas asli, nomor telepon, alamat, atau lokasi tepat. Pengunjung anonim. Tanpa iklan atau pelacakan pihak ketiga."],
      ["Mengapa", "Untuk menjawab, merujuk kasus ke ahli, menjalankan akun, dan melindungi layanan. Kami tidak menjual data."],
      ["Dasar hukum", "Pelaksanaan layanan, persetujuan Anda untuk data opsional, kepentingan sah (keamanan), dan kewajiban hukum."],
      ["Berbagi", "Hanya dengan penyedia hosting, basis data, dan model bahasa (tanpa nama atau email Anda), serta ahli (tanpa identitas)."],
      ["Penyimpanan", "Akun hingga dihapus; cache jawaban 7 hari; kasus dilepas dari akun saat dihapus; log teknis singkat."],
      ["Hak Anda", "Akses, koreksi, unduh data (JSON), dan hapus akun dari Akun saya → Pengaturan."],
      ["Cookie", "Hanya cookie sesi masuk. Obrolan di penyimpanan lokal peramban."],
      ["Anak-anak", "Tidak ditujukan untuk usia di bawah 13 tahun."],
      ["Perubahan", "Tanggal pembaruan terakhir tampil di atas halaman."],
      ["Kontak", E],
    ],
  }),
  ur: brief({
    updated: "آخری تازہ کاری: 6 اکتوبر 2026",
    settings: "ترتیبات",
    s: [
      ["ہم کون ہیں", `مستفتی (mustafti.com) معتبر مصادر سے عمومی سوالات کا جواب دیتا ہے اور فتویٰ نہیں دیتا۔ ڈیٹا کے ذمہ دار: حمدی بوزکورت — ${E}۔`],
      ["ہم کیا جمع کرتے ہیں", "اختیاری اکاؤنٹ (ای میل، نام، زبان، شہر، تصویر، تعارف)۔ گفتگو صرف آپ کے براؤزر میں رہتی ہے۔ مسئلے کی فائل نام کے بغیر، صرف ملک کے ساتھ۔ مباحثے کی پوسٹس نمایاں نام سے۔ درخواستوں کی حد کے لیے IP کا فنگر پرنٹ۔"],
      ["جو ہم جمع نہیں کرتے", "اصل شناخت، فون نمبر، پتہ یا درست مقام نہیں۔ مہمان گمنام ہے۔ نہ اشتہار، نہ بیرونی ٹریکنگ۔"],
      ["کیوں", "جواب دینے، ماہر کو حوالہ دینے، اکاؤنٹ چلانے اور سروس کی حفاظت کے لیے۔ ہم ڈیٹا فروخت نہیں کرتے۔"],
      ["قانونی بنیاد", "سروس کی فراہمی، اختیاری ڈیٹا کے لیے آپ کی رضامندی، جائز مفاد (سیکیورٹی) اور قانونی ذمہ داری۔"],
      ["شراکت", "صرف ہوسٹنگ، ڈیٹا بیس اور لینگویج ماڈل فراہم کنندگان (آپ کے نام یا ای میل کے بغیر) اور ماہر (شناخت کے بغیر) کے ساتھ۔"],
      ["مدتِ حفاظت", "اکاؤنٹ حذف ہونے تک؛ جوابات کی کیش 7 دن؛ حذف پر مسائل اکاؤنٹ سے الگ؛ تکنیکی لاگز مختصر مدت۔"],
      ["آپ کے حقوق", "رسائی، درستی، ڈیٹا ڈاؤن لوڈ (JSON) اور اکاؤنٹ حذف: میرا اکاؤنٹ ← ترتیبات۔"],
      ["کوکیز", "صرف لاگ اِن سیشن کی کوکی۔ گفتگو براؤزر کے مقامی ذخیرے میں۔"],
      ["بچے", "13 سال سے کم عمر کے لیے نہیں۔"],
      ["تبدیلیاں", "آخری تازہ کاری کی تاریخ صفحے کے اوپر ہے۔"],
      ["رابطہ", E],
    ],
  }),
  bn: brief({
    updated: "সর্বশেষ হালনাগাদ: ৬ অক্টোবর ২০২৬",
    settings: "সেটিংস",
    s: [
      ["আমরা কারা", `মুস্তাফতি (mustafti.com) অনুমোদিত উৎস থেকে সাধারণ প্রশ্নের উত্তর দেয় এবং ফতোয়া দেয় না। ডেটা নিয়ন্ত্রক: হামদি বোজকুর্ত — ${E}।`],
      ["যা সংগ্রহ করি", "ঐচ্ছিক অ্যাকাউন্ট (ইমেল, নাম, ভাষা, শহর, ছবি, পরিচিতি)। কথোপকথন শুধু আপনার ব্রাউজারে থাকে। মাসআলার ফাইল নাম ছাড়া, শুধু দেশসহ। ফোরামের পোস্ট প্রদর্শিত নামে। অনুরোধ-সীমার জন্য IP-এর ফিঙ্গারপ্রিন্ট।"],
      ["যা সংগ্রহ করি না", "প্রকৃত পরিচয়, ফোন নম্বর, ঠিকানা বা সঠিক অবস্থান নয়। অতিথি বেনামী। বিজ্ঞাপন বা তৃতীয় পক্ষের ট্র্যাকিং নেই।"],
      ["কেন", "উত্তর দিতে, বিশেষজ্ঞের কাছে পাঠাতে, অ্যাকাউন্ট চালাতে ও সেবা রক্ষা করতে। আমরা ডেটা বিক্রি করি না।"],
      ["আইনি ভিত্তি", "সেবা প্রদান, ঐচ্ছিক ডেটার জন্য আপনার সম্মতি, বৈধ স্বার্থ (নিরাপত্তা) ও আইনি বাধ্যবাধকতা।"],
      ["শেয়ার", "শুধু হোস্টিং, ডেটাবেস ও ভাষা-মডেল সরবরাহকারী (আপনার নাম বা ইমেল ছাড়া) এবং বিশেষজ্ঞ (পরিচয় ছাড়া)।"],
      ["সংরক্ষণকাল", "অ্যাকাউন্ট মুছে ফেলা পর্যন্ত; উত্তরের ক্যাশ ৭ দিন; মুছলে মাসআলা অ্যাকাউন্ট থেকে বিচ্ছিন্ন; প্রযুক্তিগত লগ স্বল্পকাল।"],
      ["আপনার অধিকার", "প্রবেশ, সংশোধন, ডেটা ডাউনলোড (JSON) ও অ্যাকাউন্ট মুছে ফেলা: আমার অ্যাকাউন্ট → সেটিংস।"],
      ["কুকি", "শুধু লগইন সেশনের কুকি। কথোপকথন ব্রাউজারের লোকাল স্টোরেজে।"],
      ["শিশু", "১৩ বছরের কম বয়সীদের জন্য নয়।"],
      ["পরিবর্তন", "সর্বশেষ হালনাগাদের তারিখ পাতার উপরে।"],
      ["যোগাযোগ", E],
    ],
  }),
  tr: brief({
    updated: "Son güncelleme: 6 Ekim 2026",
    settings: "Ayarlar",
    s: [
      ["Biz kimiz", `Mustafti (mustafti.com) genel sorulara onaylı kaynaklardan cevap verir ve fetva vermez. Veri sorumlusu: Hamdi Bozkurt — ${E}.`],
      ["Topladıklarımız", "İsteğe bağlı hesap (e-posta, ad, dil, şehir, fotoğraf, tanıtım). Sohbetler yalnızca tarayıcınızda tutulur. Mesele dosyası isimsiz, yalnızca ülke bilgisiyle. Forum gönderileri görünen adınızla. İstek sınırı için IP parmak izi."],
      ["Toplamadıklarımız", "Gerçek kimlik, telefon, adres veya kesin konum yok. Ziyaretçi anonimdir. Reklam veya üçüncü taraf takibi yok."],
      ["Neden", "Cevap vermek, meseleyi uzmana yönlendirmek, hesabı çalıştırmak ve hizmeti korumak için. Veri satmayız."],
      ["Hukuki dayanak", "Hizmetin ifası, isteğe bağlı veriler için rızanız, meşru menfaat (güvenlik) ve yasal yükümlülük."],
      ["Paylaşım", "Yalnızca barındırma, veritabanı ve dil modeli sağlayıcıları (adınız veya e-postanız olmadan) ve uzman (kimliksiz) ile."],
      ["Saklama", "Hesap silinene kadar; cevap önbelleği 7 gün; silmede meseleler hesaptan ayrılır; teknik kayıtlar kısa süre."],
      ["Haklarınız", "Erişim, düzeltme, veri indirme (JSON) ve hesap silme: Hesabım → Ayarlar."],
      ["Çerezler", "Yalnızca oturum çerezi. Sohbet tarayıcının yerel depolamasında."],
      ["Çocuklar", "13 yaş altına yönelik değildir."],
      ["Değişiklikler", "Son güncelleme tarihi sayfanın üstündedir."],
      ["İletişim", E],
    ],
  }),
  fa: brief({
    updated: "آخرین به‌روزرسانی: ۶ اکتبر ۲۰۲۶",
    settings: "تنظیمات",
    s: [
      ["ما که هستیم", `مستفتی (mustafti.com) به پرسش‌های عمومی از منابع معتبر پاسخ می‌دهد و فتوا نمی‌دهد. مسئول داده: حمدی بوزکورت — ${E}.`],
      ["آنچه جمع می‌کنیم", "حساب اختیاری (ایمیل، نام، زبان، شهر، تصویر، معرفی). گفت‌وگو فقط در مرورگر شما می‌ماند. پرونده مسئله بی‌نام، فقط با کشور. پست‌های انجمن با نام نمایشی. اثر انگشت IP برای محدودیت درخواست."],
      ["آنچه جمع نمی‌کنیم", "هویت واقعی، تلفن، نشانی یا موقعیت دقیق نه. مهمان ناشناس است. بدون تبلیغ و ردیابی شخص ثالث."],
      ["چرا", "برای پاسخ، ارجاع به متخصص، اداره حساب و حفاظت از سرویس. داده نمی‌فروشیم."],
      ["مبنای قانونی", "اجرای خدمت، رضایت شما برای داده‌های اختیاری، منافع مشروع (امنیت) و تکلیف قانونی."],
      ["اشتراک‌گذاری", "فقط با ارائه‌دهندگان میزبانی، پایگاه داده و مدل زبانی (بدون نام یا ایمیل شما) و متخصص (بدون هویت)."],
      ["مدت نگهداری", "حساب تا حذف؛ حافظه پاسخ‌ها ۷ روز؛ هنگام حذف، مسائل از حساب جدا می‌شوند؛ گزارش‌های فنی کوتاه‌مدت."],
      ["حقوق شما", "دسترسی، اصلاح، دریافت داده (JSON) و حذف حساب: حساب من ← تنظیمات."],
      ["کوکی‌ها", "فقط کوکی نشست ورود. گفت‌وگو در حافظه محلی مرورگر."],
      ["کودکان", "برای کمتر از ۱۳ سال نیست."],
      ["تغییرات", "تاریخ آخرین به‌روزرسانی بالای صفحه است."],
      ["تماس", E],
    ],
  }),
  fr: brief({
    updated: "Dernière mise à jour : 6 octobre 2026",
    settings: "Paramètres",
    s: [
      ["Qui sommes-nous", `Mustafti (mustafti.com) répond aux questions générales à partir de sources approuvées et ne délivre pas de fatwa. Responsable du traitement : Hamdi Bozkurt — ${E}.`],
      ["Ce que nous collectons", "Compte facultatif (e-mail, nom, langue, ville, photo, présentation). Les discussions restent uniquement dans votre navigateur. Dossier anonyme, avec le pays seulement. Messages du forum sous votre nom affiché. Empreinte de l'adresse IP pour limiter les requêtes."],
      ["Ce que nous ne collectons pas", "Ni identité réelle, ni téléphone, ni adresse, ni position précise. Le visiteur est anonyme. Ni publicité ni pistage tiers."],
      ["Pourquoi", "Pour répondre, transmettre un cas à un spécialiste, gérer le compte et protéger le service. Nous ne vendons aucune donnée."],
      ["Base légale", "Exécution du service, votre consentement pour les données facultatives, intérêt légitime (sécurité) et obligation légale."],
      ["Partage", "Uniquement avec les prestataires d'hébergement, de base de données et de modèle de langage (sans votre nom ni e-mail), et le spécialiste (sans identité)."],
      ["Conservation", "Compte jusqu'à sa suppression ; cache des réponses 7 jours ; dossiers détachés du compte à la suppression ; journaux techniques brefs."],
      ["Vos droits", "Accès, rectification, téléchargement (JSON) et suppression : Mon compte → Paramètres."],
      ["Cookies", "Uniquement le cookie de session. Discussion dans le stockage local du navigateur."],
      ["Enfants", "Non destiné aux moins de 13 ans."],
      ["Modifications", "La date de dernière mise à jour figure en haut de la page."],
      ["Contact", E],
    ],
  }),
  ms: brief({
    updated: "Kemas kini terakhir: 6 Oktober 2026",
    settings: "Tetapan",
    s: [
      ["Siapa kami", `Mustafti (mustafti.com) menjawab soalan umum daripada sumber rasmi dan tidak berfatwa. Pengawal data: Hamdi Bozkurt — ${E}.`],
      ["Apa yang kami kumpul", "Akaun pilihan (e-mel, nama, bahasa, bandar, foto, bio). Perbualan disimpan hanya dalam pelayar anda. Fail kes tanpa nama, hanya negara. Hantaran forum dengan nama paparan. Cap jari IP untuk had permintaan."],
      ["Apa yang tidak kami kumpul", "Identiti sebenar, telefon, alamat atau lokasi tepat. Pelawat tanpa nama. Tiada iklan atau penjejakan pihak ketiga."],
      ["Mengapa", "Untuk menjawab, merujuk kes kepada pakar, mengendalikan akaun dan melindungi perkhidmatan. Kami tidak menjual data."],
      ["Asas undang-undang", "Pelaksanaan perkhidmatan, persetujuan anda untuk data pilihan, kepentingan sah (keselamatan) dan kewajipan undang-undang."],
      ["Perkongsian", "Hanya dengan penyedia pengehosan, pangkalan data dan model bahasa (tanpa nama atau e-mel anda) serta pakar (tanpa identiti)."],
      ["Tempoh simpanan", "Akaun sehingga dipadam; cache jawapan 7 hari; kes dipisahkan daripada akaun apabila dipadam; log teknikal singkat."],
      ["Hak anda", "Akses, pembetulan, muat turun data (JSON) dan padam akaun: Akaun saya → Tetapan."],
      ["Kuki", "Hanya kuki sesi log masuk. Perbualan dalam storan setempat pelayar."],
      ["Kanak-kanak", "Tidak ditujukan kepada bawah 13 tahun."],
      ["Perubahan", "Tarikh kemas kini terakhir di bahagian atas halaman."],
      ["Hubungi", E],
    ],
  }),
  ru: brief({
    updated: "Последнее обновление: 6 октября 2026 г.",
    settings: "Настройки",
    s: [
      ["Кто мы", `Мустафти (mustafti.com) отвечает на общие вопросы по утверждённым источникам и не выносит фетв. Оператор данных: Хамди Бозкурт — ${E}.`],
      ["Что мы собираем", "Необязательный аккаунт (e-mail, имя, язык, город, фото, описание). Чаты хранятся только в вашем браузере. Файл вопроса без имени, только страна. Сообщения форума под отображаемым именем. Отпечаток IP для ограничения запросов."],
      ["Чего мы не собираем", "Ни настоящей личности, ни телефона, ни адреса, ни точного местоположения. Гость анонимен. Без рекламы и стороннего отслеживания."],
      ["Зачем", "Чтобы отвечать, передавать вопрос специалисту, вести аккаунт и защищать сервис. Мы не продаём данные."],
      ["Правовое основание", "Оказание услуги, ваше согласие на необязательные данные, законный интерес (безопасность) и требования закона."],
      ["Передача", "Только поставщикам хостинга, базы данных и языковой модели (без вашего имени и e-mail) и специалисту (без личных данных)."],
      ["Сроки хранения", "Аккаунт — до удаления; кэш ответов — 7 дней; при удалении вопросы отвязываются от аккаунта; технические журналы — недолго."],
      ["Ваши права", "Доступ, исправление, скачивание данных (JSON) и удаление аккаунта: Мой аккаунт → Настройки."],
      ["Файлы cookie", "Только cookie сеанса входа. Чат — в локальном хранилище браузера."],
      ["Дети", "Сервис не предназначен для детей до 13 лет."],
      ["Изменения", "Дата последнего обновления указана вверху страницы."],
      ["Контакты", E],
    ],
  }),
  sw: brief({
    updated: "Ilisasishwa mwisho: 6 Oktoba 2026",
    settings: "Mipangilio",
    s: [
      ["Sisi ni nani", `Mustafti (mustafti.com) hujibu maswali ya jumla kutoka vyanzo rasmi na haitoi fatwa. Msimamizi wa data: Hamdi Bozkurt — ${E}.`],
      ["Tunachokusanya", "Akaunti ya hiari (barua pepe, jina, lugha, mji, picha, wasifu). Mazungumzo hubaki kwenye kivinjari chako pekee. Faili la swali bila jina, nchi tu. Machapisho ya jukwaa kwa jina lako. Alama ya IP kwa kikomo cha maombi."],
      ["Tusichokusanya", "Utambulisho halisi, simu, anwani au mahali halisi hapana. Mgeni hajulikani. Hakuna matangazo wala ufuatiliaji wa nje."],
      ["Kwa nini", "Kujibu, kupeleka swali kwa mtaalamu, kuendesha akaunti na kulinda huduma. Hatuuzi data."],
      ["Msingi wa kisheria", "Utoaji wa huduma, ridhaa yako kwa data ya hiari, maslahi halali (usalama) na wajibu wa kisheria."],
      ["Kushiriki", "Na watoa huduma wa upangishaji, hifadhidata na modeli ya lugha pekee (bila jina wala barua pepe yako) na mtaalamu (bila utambulisho)."],
      ["Muda wa kuhifadhi", "Akaunti hadi ifutwe; kumbukumbu ya majibu siku 7; maswali hutenganishwa na akaunti ikifutwa; kumbukumbu za kiufundi muda mfupi."],
      ["Haki zako", "Kufikia, kurekebisha, kupakua data (JSON) na kufuta akaunti: Akaunti yangu → Mipangilio."],
      ["Vidakuzi", "Kidakuzi cha kuingia pekee. Mazungumzo kwenye hifadhi ya ndani ya kivinjari."],
      ["Watoto", "Si kwa walio chini ya miaka 13."],
      ["Mabadiliko", "Tarehe ya sasisho la mwisho iko juu ya ukurasa."],
      ["Mawasiliano", E],
    ],
  }),
  ha: brief({
    updated: "Sabuntawa ta karshe: 6 ga Oktoba 2026",
    settings: "Saituna",
    s: [
      ["Su wane ne mu", `Mustafti (mustafti.com) yana amsa tambayoyi na gama-gari daga majiyoyin hukuma kuma ba ya bayar da fatawa. Mai kula da bayanai: Hamdi Bozkurt — ${E}.`],
      ["Abin da muke tattarawa", "Asusu na zabi (imel, suna, harshe, gari, hoto, bayani). Tattaunawa tana zama a burauzarka kawai. Fayil din tambaya ba suna, sai kasa. Rubuce-rubucen dandali da sunanka. Alamar IP don iyakance bukatu."],
      ["Abin da ba mu tattarawa", "Ba ainihin bayananka, waya, adireshi ko wurin da kake daidai ba. Bako ba a san shi ba. Babu talla ko bin diddigi na waje."],
      ["Me ya sa", "Don amsawa, mika tambaya ga kwararre, gudanar da asusu da kare sabis. Ba ma sayar da bayanai."],
      ["Tushen doka", "Bayar da sabis, yardarka ga bayanan zabi, halaltacciyar bukata (tsaro) da wajibin doka."],
      ["Rabawa", "Kawai da masu samar da masauki, rumbun bayanai da samfurin harshe (ba tare da sunanka ko imel ba) da kwararre (ba tare da bayananka ba)."],
      ["Lokacin ajiya", "Asusu har sai an goge; ajiyar amsoshi kwana 7; ana raba tambayoyi da asusu idan an goge; bayanan fasaha na dan lokaci."],
      ["Hakkokinka", "Samun dama, gyara, sauke bayanai (JSON) da goge asusu: Asusuna → Saituna."],
      ["Kukis", "Kukis na zaman shiga kawai. Tattaunawa a ma'ajiyar burauza."],
      ["Yara", "Ba don yara 'yan kasa da shekara 13 ba."],
      ["Canje-canje", "Ranar sabuntawa ta karshe tana saman shafi."],
      ["Tuntuba", E],
    ],
  }),
};

export const PRIVACY: Record<Locale, PageContent> = { ar, en, ...others };
