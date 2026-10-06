import type { Locale } from "@/i18n/locales";

/**
 * F1: محتوى صفحات «عن مُستفتي» (/about) و«الشفافية والاختبار» (/eval) و«الخصوصية» (/privacy).
 * العربية والإنجليزية كاملتان، واللغات العشر الأخرى ترجمة مختصرة. نص ثابت في الكود (لا قاعدة بيانات)،
 * ولا يذكر اسم النموذج اللغوي ولا الشركة المزوّدة (القاعدة 2د في CLAUDE.md).
 */

export const REPO_URL = "https://github.com/hamdibozkurt1453/mustafti";

export type PageSection = {
  title: string;
  paras?: string[];
  items?: string[];
  /** رابط داخلي (/new-muslim) أو خارجي (https://…) في آخر القسم. */
  link?: { label: string; href: string };
};

export type PageContent = { sections: PageSection[] };

export type InfoPage = "about" | "eval" | "privacy";

const ar: Record<InfoPage, PageContent> = {
  about: {
    sections: [
      {
        title: "ما مُستفتي؟",
        paras: [
          "مُستفتي منصة تفهم سؤالك الديني وتستوضحه، ثم تجيبك عن الأسئلة العامة بعلم مسلم متزن، وتقوّي الجواب بالدليل من المصادر المعتمدة برقم [n] يفتح النص ورابطه الأصلي.",
          "مُستفتي لا يُفتي: لا يُصدر حكماً شرعياً في حالتك الشخصية. إن كان سؤالك واقعة تخصك يختلف حكمها بتفاصيلها، استوضح أركانها وأعدّ لك «ملف مسألة» بلا هوية، وأحاله إلى مختص.",
        ],
      },
      {
        title: "لمن؟",
        paras: ["لكل سائل، بلا تسجيل: المسلم، ومن أسلم حديثاً، ومن يريد أن يتعرّف على الإسلام. وبإثنتي عشرة لغة."],
      },
      {
        title: "ثلاثة مسارات",
        items: [
          "المسلم: المحادثة في الصفحة الرئيسية، بمساعد علمي مسلم يجيب ويستشهد بالمصادر.",
          "المسلم الجديد: «المرشد» في /new-muslim، يشرح خطوة خطوة بهدوء: الطهارة والصلاة والأذكار والأيام الأولى.",
          "غير المسلم: «الداعية» في /discover، يعرّف بالإسلام بلطف ويجيب عن الأسئلة والشبهات بالدليل.",
        ],
        link: { label: "ابدأ رحلة المسلم الجديد", href: "/new-muslim" },
      },
      {
        title: "المختصون",
        paras: [
          "المفتون والدعاة ومرشدو المسلمين الجدد يُقبلون يدوياً بعد التحقق من شهاداتهم أو تزكياتهم. يستلمون ملفات المسائل المحالة بلا هوية السائل، ويجيبون عنها، ولكل منهم ملف عام موثّق.",
        ],
        link: { label: "انضم كمختص", href: "/experts/join" },
      },
      {
        title: "المصادر",
        paras: [
          "النص المنقول والمنسوب (آية، أو حديث، أو قول عالم، أو فتوى منشورة) يأتي من المرجعية المعتمدة وحدها: خادم المحتوى الإسلامي الرسمي للجمعية (القرآن الكريم وترجماته وتفاسيره، وموسوعة الأحاديث النبوية، ومكتبة دار الإسلام IslamHouse)، ومواقع المرجعية والحزمة العلمية للتحدي، ومنها مواقع الفتاوى المعتمدة. لا بحث في الويب العام.",
          "كل نص منقول يظهر في بطاقة بحروفه ورابطه، فتتحقق منه بنفسك.",
        ],
      },
    ],
  },
  eval: {
    sections: [
      {
        title: "كيف يعمل",
        items: [
          "التصنيف: كل سؤال يُصنَّف أولاً بلغته ونوع السائل ومستواه: عام (أ، ب)، أو خلافي (ج)، أو حالة شخصية (د)، أو عاجل.",
          "المصادر: يُبحث عن النصوص ذات الصلة في المرجعية المعتمدة وحدها (خادم المحتوى الرسمي، والمواقع المعتمدة، والفتاوى المنشورة).",
          "الدليل [n]: المساعد يجيب بعلمه كاملاً، ويستشهد بالمصادر برقم [n] حيث تنطبق. كل رقم يفتح بطاقة النص بحروفه ورابطه الأصلي.",
          "الحارس: يفحص كل جملة قبل أن تصلك، ويتدخل في ثلاث حالات فقط: (1) نص منسوب (آية أو حديث أو قول عالم) لا يطابق مصدراً مسترجعاً: يُصحَّح إلى نص المصدر، أو يُذكر معناه بلا نسبة؛ (2) فتوى شخصية لحالة فردية: تُمنع ويُحال السائل؛ (3) ذكر اسم النموذج أو الشركة المزوّدة، أو محتوى مسيء: تُحذف جملته.",
          "الإحالة: الحالة الشخصية تُستوضح أركانها، ثم تُعرض الفتوى المنشورة القريبة للاطلاع فقط بمقتطفها ورابطها، ويُعدّ ملف مسألة بلا هوية يُحال إلى مختص. والحالة العاجلة توجَّه فوراً إلى جهة مختصة.",
        ],
      },
      {
        title: "ما لا يفعله",
        items: [
          "لا يُفتي في حالتك الشخصية، ولا يقول إن عبادتك أو عقدك صحيح أو باطل.",
          "لا يخترع نصاً منسوباً: الآية والحديث وقول العالم بنص مصدرها أو بمعناها بلا نسبة.",
          "لا يبحث في الويب العام، ولا يرجّح في المسائل الخلافية الحساسة.",
          "لا يذكر اسم النموذج اللغوي ولا الشركة المزوّدة، ويعرّف نفسه دائماً بـ«مُستفتي».",
        ],
      },
      {
        title: "الاختبار",
        paras: [
          "اختبارات آلية تعمل مع كل تعديل (التصنيف، والحارس، والاسترجاع، والصلاحيات، وقاعدة البيانات)، وصفحات فحص حية للمشرفين تشغّل أسئلة المرجعية وتقيس اكتمال الجواب وزمنه. جدول النتائج يُنشر هنا قريباً.",
          "الكود كله منشور في المستودع للاطلاع والتقييم.",
        ],
        link: { label: "المستودع على GitHub", href: REPO_URL },
      },
    ],
  },
  privacy: {
    sections: [
      {
        title: "ما نجمعه",
        items: [
          "لا تحتاج حساباً لتسأل. محادثة الزائر تبقى في متصفحه وحده (التخزين المحلي)، ولا تُربط بهويته.",
          "لكي نجيب، تصل رسالتك وآخر رسائل المحادثة إلى الخادم سياقاً للجواب، ولا تُحفظ باسمك.",
          "إحصاءات عامة بلا نص السؤال ولا هوية: اللغة، والمستوى، وعدد المصادر.",
          "الأجوبة عن الأسئلة العامة قد تُخزَّن 7 أيام بلا أي بيانات عن السائل، لتسريع الجواب عن السؤال نفسه.",
          "إن أنشأت حساباً: بريدك، واسمك المعروض، ولغتك المفضّلة، ومدينتك وطريقة حساب المواقيت إن اخترتها، وصورتك ونبذتك إن أضفتهما.",
          "ملف المسألة المحال إلى مختص: الوقائع التي كتبتها بلا هويتك، وبلدك فقط (لا عنوانك) لتوجيهه إلى مختص من بلدك، وبريد المتابعة إن أدخلته.",
          "مشاركاتك في «الحوار» تُنشر باسمك المعروض.",
          "حد الطلبات يُحسب ببصمة لعنوان IP لا بالعنوان نفسه، لحماية الخدمة من الإساءة.",
        ],
      },
      {
        title: "ما لا نجمعه",
        items: [
          "لا إعلانات، ولا تتبّع من جهات خارجية، ولا بيع لأي بيانات.",
          "لا نطلب هويتك ولا رقم هاتفك ولا موقعك الدقيق. «استعمل موقعي» في بطاقة المواقيت يُحسب في متصفحك.",
          "لا يرى المختص اسمك ولا بريدك؛ يرى وقائع المسألة فقط.",
        ],
      },
      {
        title: "تنزيل بياناتك",
        paras: ["من «حسابي» ← «الإعدادات» ← «تنزيل بياناتي»: ملف JSON فيه حسابك ومسائلك وملفاتها والأجوبة عليها."],
        link: { label: "الإعدادات", href: "/me?tab=settings" },
      },
      {
        title: "حذف الحساب",
        paras: [
          "من «حسابي» ← «الإعدادات» ← «حذف حسابي وبياناتي»، بتأكيد مزدوج. يُحذف حسابك وملفك الشخصي وصورك ووثائقك نهائياً، وتُفصل مسائلك عن حسابك ويُمحى بريد المتابعة منها، وتبقى أجوبة المختصين.",
        ],
      },
    ],
  },
};

const en: Record<InfoPage, PageContent> = {
  about: {
    sections: [
      {
        title: "What is Mustafti?",
        paras: [
          "Mustafti understands your religious question and clarifies it, then answers general questions with balanced Muslim knowledge, strengthened by evidence from approved sources: each [n] opens the quoted text and its original link.",
          "Mustafti does not issue fatwas: it never rules on your personal case. If your question is a personal matter whose ruling depends on its details, it clarifies the key facts, prepares an anonymous case file, and refers it to a qualified specialist.",
        ],
      },
      {
        title: "Who is it for?",
        paras: ["Anyone, with no sign-up needed: Muslims, new Muslims, and anyone curious about Islam, in twelve languages."],
      },
      {
        title: "Three paths",
        items: [
          "Muslims: the chat on the home page, a Muslim scholarly assistant that answers and cites sources.",
          "New Muslims: the Mentor at /new-muslim explains things calmly, step by step: purification, prayer, remembrance and the first days.",
          "Non-Muslims: the Guide at /discover introduces Islam gently and answers questions and doubts with evidence.",
        ],
        link: { label: "Start the new Muslim journey", href: "/new-muslim" },
      },
      {
        title: "Specialists",
        paras: [
          "Muftis, preachers and new-Muslim mentors are accepted manually after their certificates or recommendations are verified. They receive referred case files without the asker's identity, answer them, and each has a verified public profile.",
        ],
        link: { label: "Join as a specialist", href: "/experts/join" },
      },
      {
        title: "Sources",
        paras: [
          "Quoted and attributed text (a verse, a hadith, a scholar's words or a published fatwa) comes only from the approved references: the official Islamic content server (the Qur'an with its translations and tafsir, the Hadith Encyclopedia, and the IslamHouse library), and the sites listed in the challenge's reference pack, including approved fatwa sites. No general web search.",
          "Every quoted text appears in a card, verbatim and with its link, so you can check it yourself.",
        ],
      },
    ],
  },
  eval: {
    sections: [
      {
        title: "How it works",
        items: [
          "Classification: each question is first classified by language, asker type and level: general (A, B), disputed (C), personal case (D), or urgent.",
          "Sources: relevant texts are retrieved from the approved references only (the official content server, approved sites and published fatwas).",
          "Evidence [n]: the assistant answers fully from its knowledge and cites sources with [n] where they apply. Each number opens a card with the exact text and its original link.",
          "The guard checks every sentence before it reaches you and acts in three cases only: (1) an attributed text (verse, hadith or scholar's words) that does not match a retrieved source is corrected to the source text, or given by meaning without attribution; (2) a personal fatwa on an individual case is blocked and the asker is referred; (3) a mention of the model's name or its provider, or offensive content, is removed.",
          "Referral: for a personal case, the key facts are clarified, a closely related published fatwa may be shown for reference only (verbatim excerpt and link), and an anonymous case file is referred to a specialist. Urgent cases are directed to the right authority at once.",
        ],
      },
      {
        title: "What it does not do",
        items: [
          "It does not rule on your personal case or declare your worship or contract valid or invalid.",
          "It does not invent attributed text: verses, hadiths and scholars' words appear verbatim from a source, or by meaning without attribution.",
          "It does not search the general web, and it does not take sides on sensitive disputed issues.",
          "It never names the language model or its provider, and always introduces itself as Mustafti.",
        ],
      },
      {
        title: "Testing",
        paras: [
          "Automated tests run on every change (classification, guard, retrieval, permissions, database), and live test pages for admins run the reference questions and measure answer completeness and time. The results table will be published here soon.",
          "All the code is published in the repository for review and evaluation.",
        ],
        link: { label: "Repository on GitHub", href: REPO_URL },
      },
    ],
  },
  privacy: {
    sections: [
      {
        title: "What we collect",
        items: [
          "You don't need an account to ask. A visitor's chat stays in their own browser (local storage) and is not linked to their identity.",
          "To answer, your message and the latest messages of the chat reach the server as context, and are not saved under your name.",
          "Anonymous statistics without the question text: language, level and number of sources.",
          "Answers to general questions may be cached for 7 days, with no data about the asker, to answer the same question faster.",
          "If you create an account: your email, display name, preferred language, your city and prayer-time method if you choose them, and your photo and bio if you add them.",
          "A case file referred to a specialist: the facts you wrote without your identity, your country only (not your address) to route it to a specialist from your country, and a follow-up email if you enter one.",
          "Your posts in the Forum are published under your display name.",
          "Rate limiting uses a fingerprint of the IP address, not the address itself, to protect the service from abuse.",
        ],
      },
      {
        title: "What we don't collect",
        items: [
          "No ads, no third-party tracking, and no selling of any data.",
          "We don't ask for your identity, phone number or precise location. \"Use my location\" on the prayer card is computed in your browser.",
          "A specialist never sees your name or email; only the facts of the case.",
        ],
      },
      {
        title: "Download your data",
        paras: ["From My account → Settings → Download my data: a JSON file with your account, your cases, their files and the answers."],
        link: { label: "Settings", href: "/me?tab=settings" },
      },
      {
        title: "Delete your account",
        paras: [
          "From My account → Settings → Delete my account and data, with a double confirmation. Your account, profile, photos and documents are deleted permanently; your cases are detached from your account and their follow-up email erased; specialists' answers remain.",
        ],
      },
    ],
  },
};

/** ترجمة مختصرة: ثلاثة أقسام لكل صفحة بالعبارات الأساسية، والروابط كما في العربية والإنجليزية. */
function brief(t: {
  about: [string, string, string, string, string, string];
  eval: [string, string, string, string, string, string];
  privacy: [string, string, string, string, string, string];
  repo: string;
  settings: string;
}): Record<InfoPage, PageContent> {
  return {
    about: {
      sections: [
        { title: t.about[0], paras: [t.about[1]] },
        { title: t.about[2], paras: [t.about[3]] },
        { title: t.about[4], paras: [t.about[5]] },
      ],
    },
    eval: {
      sections: [
        { title: t.eval[0], paras: [t.eval[1]] },
        { title: t.eval[2], paras: [t.eval[3]] },
        { title: t.eval[4], paras: [t.eval[5]], link: { label: t.repo, href: REPO_URL } },
      ],
    },
    privacy: {
      sections: [
        { title: t.privacy[0], paras: [t.privacy[1]] },
        { title: t.privacy[2], paras: [t.privacy[3]] },
        { title: t.privacy[4], paras: [t.privacy[5]], link: { label: t.settings, href: "/me?tab=settings" } },
      ],
    },
  };
}

const id = brief({
  about: [
    "Apa itu Mustafti?",
    "Mustafti memahami dan memperjelas pertanyaan agama Anda, menjawab pertanyaan umum dengan ilmu yang seimbang, dan menguatkannya dengan dalil dari sumber resmi [n]. Mustafti tidak berfatwa untuk kasus pribadi; kasus pribadi dirujuk kepada ahli tanpa identitas Anda.",
    "Tiga jalur",
    "Muslim: obrolan di beranda. Mualaf: Pembimbing di /new-muslim. Non-Muslim: Pendakwah di /discover.",
    "Ahli dan sumber",
    "Mufti dan dai diterima secara manual setelah verifikasi. Teks yang dikutip hanya berasal dari referensi resmi: server konten Islam resmi (Al-Qur'an, hadis, IslamHouse) dan situs yang disetujui.",
  ],
  eval: [
    "Cara kerja",
    "Klasifikasi pertanyaan (umum, diperselisihkan, kasus pribadi, darurat), pencarian sumber resmi, dalil [n], lalu penjaga yang bertindak hanya dalam tiga hal: kutipan yang tidak cocok dengan sumber, fatwa pribadi, dan penyebutan nama model atau penyedianya. Kasus pribadi dirujuk kepada ahli.",
    "Yang tidak dilakukan",
    "Tidak berfatwa untuk kasus pribadi, tidak mengarang kutipan, dan tidak mencari di web umum.",
    "Pengujian",
    "Tes otomatis berjalan pada setiap perubahan. Tabel hasil akan segera diterbitkan di sini.",
  ],
  privacy: [
    "Yang kami kumpulkan",
    "Bertanya tanpa akun. Obrolan pengunjung tetap di peramban. Untuk akun: email, nama, bahasa, kota, foto dan bio jika ditambahkan. Berkas kasus tanpa identitas, hanya negara.",
    "Yang tidak kami kumpulkan",
    "Tanpa iklan, tanpa pelacakan pihak ketiga, tanpa menjual data. Ahli tidak melihat nama atau email Anda.",
    "Unduh dan hapus",
    "Dari Akun saya → Pengaturan: unduh data Anda (JSON) atau hapus akun Anda secara permanen.",
  ],
  repo: "Repositori di GitHub",
  settings: "Pengaturan",
});

const ur = brief({
  about: [
    "مستفتی کیا ہے؟",
    "مستفتی آپ کے دینی سوال کو سمجھتا اور واضح کرتا ہے، عمومی سوالات کا متوازن علم سے جواب دیتا ہے اور معتبر مصادر سے دلیل [n] پیش کرتا ہے۔ مستفتی ذاتی معاملے میں فتویٰ نہیں دیتا؛ ذاتی معاملہ آپ کی شناخت کے بغیر ماہر کے حوالے کیا جاتا ہے۔",
    "تین راستے",
    "مسلمان: مرکزی صفحے پر گفتگو۔ نو مسلم: /new-muslim پر رہنما۔ غیر مسلم: /discover پر داعی۔",
    "ماہرین اور مصادر",
    "مفتی اور داعی تصدیق کے بعد دستی طور پر قبول کیے جاتے ہیں۔ منقول متن صرف معتبر مرجع سے آتا ہے: سرکاری اسلامی مواد سرور (قرآن، حدیث، IslamHouse) اور منظور شدہ ویب سائٹس۔",
  ],
  eval: [
    "یہ کیسے کام کرتا ہے",
    "سوال کی درجہ بندی (عمومی، اختلافی، ذاتی معاملہ، فوری)، معتبر مصادر کی تلاش، دلیل [n]، اور نگران جو صرف تین صورتوں میں مداخلت کرتا ہے: مصدر سے غیر مطابق منسوب متن، ذاتی فتویٰ، اور ماڈل یا فراہم کنندہ کا نام۔ ذاتی معاملہ ماہر کے حوالے ہوتا ہے۔",
    "جو یہ نہیں کرتا",
    "ذاتی فتویٰ نہیں دیتا، منسوب متن نہیں گھڑتا، اور عام ویب پر تلاش نہیں کرتا۔",
    "جانچ",
    "ہر تبدیلی پر خودکار جانچ چلتی ہے۔ نتائج کا جدول جلد یہاں شائع ہوگا۔",
  ],
  privacy: [
    "ہم کیا جمع کرتے ہیں",
    "سوال کے لیے اکاؤنٹ ضروری نہیں۔ مہمان کی گفتگو اس کے براؤزر میں رہتی ہے۔ اکاؤنٹ کے لیے: ای میل، نام، زبان، شہر، اور تصویر و تعارف اگر شامل کریں۔ مسئلے کی فائل شناخت کے بغیر، صرف ملک کے ساتھ۔",
    "ہم کیا جمع نہیں کرتے",
    "نہ اشتہار، نہ بیرونی ٹریکنگ، نہ ڈیٹا کی فروخت۔ ماہر آپ کا نام یا ای میل نہیں دیکھتا۔",
    "ڈاؤن لوڈ اور حذف",
    "میرا اکاؤنٹ ← ترتیبات: اپنا ڈیٹا (JSON) ڈاؤن لوڈ کریں یا اکاؤنٹ مستقل طور پر حذف کریں۔",
  ],
  repo: "GitHub پر ریپوزٹری",
  settings: "ترتیبات",
});

const bn = brief({
  about: [
    "মুস্তাফতি কী?",
    "মুস্তাফতি আপনার ধর্মীয় প্রশ্ন বুঝে ও স্পষ্ট করে, সাধারণ প্রশ্নের ভারসাম্যপূর্ণ জ্ঞানে উত্তর দেয় এবং অনুমোদিত উৎস থেকে দলিল [n] দিয়ে তা শক্তিশালী করে। মুস্তাফতি ব্যক্তিগত বিষয়ে ফতোয়া দেয় না; ব্যক্তিগত বিষয় আপনার পরিচয় ছাড়াই বিশেষজ্ঞের কাছে পাঠানো হয়।",
    "তিনটি পথ",
    "মুসলিম: হোম পেজে কথোপকথন। নওমুসলিম: /new-muslim-এ পথপ্রদর্শক। অমুসলিম: /discover-এ দাঈ।",
    "বিশেষজ্ঞ ও উৎস",
    "মুফতি ও দাঈরা যাচাইয়ের পর হাতে-কলমে গৃহীত হন। উদ্ধৃত পাঠ শুধু অনুমোদিত রেফারেন্স থেকে: অফিসিয়াল ইসলামিক কনটেন্ট সার্ভার (কুরআন, হাদিস, IslamHouse) ও অনুমোদিত সাইট।",
  ],
  eval: [
    "কীভাবে কাজ করে",
    "প্রশ্নের শ্রেণিবিভাগ (সাধারণ, মতভেদপূর্ণ, ব্যক্তিগত, জরুরি), অনুমোদিত উৎসে অনুসন্ধান, দলিল [n], এবং প্রহরী যা কেবল তিন ক্ষেত্রে হস্তক্ষেপ করে: উৎসের সাথে না মেলা উদ্ধৃতি, ব্যক্তিগত ফতোয়া, এবং মডেল বা সরবরাহকারীর নাম। ব্যক্তিগত বিষয় বিশেষজ্ঞের কাছে যায়।",
    "যা করে না",
    "ব্যক্তিগত ফতোয়া দেয় না, উদ্ধৃতি বানায় না, সাধারণ ওয়েবে খোঁজে না।",
    "পরীক্ষা",
    "প্রতিটি পরিবর্তনে স্বয়ংক্রিয় পরীক্ষা চলে। ফলাফলের টেবিল শীঘ্রই এখানে প্রকাশিত হবে।",
  ],
  privacy: [
    "আমরা যা সংগ্রহ করি",
    "প্রশ্ন করতে অ্যাকাউন্ট লাগে না। অতিথির কথোপকথন তার ব্রাউজারেই থাকে। অ্যাকাউন্টের জন্য: ইমেল, নাম, ভাষা, শহর, এবং ছবি ও পরিচিতি যোগ করলে। মাসআলার ফাইল পরিচয় ছাড়া, শুধু দেশসহ।",
    "যা সংগ্রহ করি না",
    "কোনো বিজ্ঞাপন, তৃতীয় পক্ষের ট্র্যাকিং বা ডেটা বিক্রি নেই। বিশেষজ্ঞ আপনার নাম বা ইমেল দেখেন না।",
    "ডাউনলোড ও মুছে ফেলা",
    "আমার অ্যাকাউন্ট → সেটিংস: আপনার ডেটা (JSON) ডাউনলোড করুন বা অ্যাকাউন্ট স্থায়ীভাবে মুছুন।",
  ],
  repo: "GitHub-এ রিপোজিটরি",
  settings: "সেটিংস",
});

const tr = brief({
  about: [
    "Mustafti nedir?",
    "Mustafti dinî sorunuzu anlar ve netleştirir, genel sorulara dengeli bir ilimle cevap verir ve cevabı onaylı kaynaklardan delillerle [n] güçlendirir. Mustafti kişisel duruma fetva vermez; kişisel durum kimliğiniz olmadan bir uzmana yönlendirilir.",
    "Üç yol",
    "Müslüman: ana sayfadaki sohbet. Yeni Müslüman: /new-muslim adresindeki Rehber. Gayrimüslim: /discover adresindeki Davetçi.",
    "Uzmanlar ve kaynaklar",
    "Müftüler ve davetçiler doğrulamadan sonra elle kabul edilir. Alıntılanan metin yalnızca onaylı referanslardan gelir: resmî İslami içerik sunucusu (Kur'an, hadis, IslamHouse) ve onaylı siteler.",
  ],
  eval: [
    "Nasıl çalışır",
    "Sorunun sınıflandırılması (genel, ihtilaflı, kişisel durum, acil), onaylı kaynaklarda arama, delil [n] ve yalnızca üç durumda devreye giren bekçi: kaynakla örtüşmeyen nispet edilmiş metin, kişisel fetva ve modelin ya da sağlayıcısının adı. Kişisel durum bir uzmana yönlendirilir.",
    "Yapmadıkları",
    "Kişisel fetva vermez, alıntı uydurmaz ve genel web'de arama yapmaz.",
    "Test",
    "Her değişiklikte otomatik testler çalışır. Sonuç tablosu yakında burada yayımlanacak.",
  ],
  privacy: [
    "Topladıklarımız",
    "Soru sormak için hesap gerekmez. Ziyaretçinin sohbeti kendi tarayıcısında kalır. Hesap için: e-posta, ad, dil, şehir ve eklerseniz fotoğraf ile kısa tanıtım. Mesele dosyası kimliksiz, yalnızca ülke bilgisiyle.",
    "Toplamadıklarımız",
    "Reklam, üçüncü taraf takibi ve veri satışı yok. Uzman adınızı veya e-postanızı görmez.",
    "İndirme ve silme",
    "Hesabım → Ayarlar: verilerinizi (JSON) indirin veya hesabınızı kalıcı olarak silin.",
  ],
  repo: "GitHub'daki depo",
  settings: "Ayarlar",
});

const fa = brief({
  about: [
    "مستفتی چیست؟",
    "مستفتی پرسش دینی شما را می‌فهمد و روشن می‌کند، به پرسش‌های عمومی با دانشی متعادل پاسخ می‌دهد و پاسخ را با دلیل از منابع معتبر [n] تقویت می‌کند. مستفتی برای مسئله شخصی فتوا نمی‌دهد؛ مسئله شخصی بدون هویت شما به متخصص ارجاع می‌شود.",
    "سه مسیر",
    "مسلمان: گفت‌وگو در صفحه اصلی. نومسلمان: راهنما در /new-muslim. غیرمسلمان: داعی در /discover.",
    "متخصصان و منابع",
    "مفتیان و داعیان پس از راستی‌آزمایی به‌صورت دستی پذیرفته می‌شوند. متن نقل‌شده فقط از مرجع معتبر می‌آید: سرور رسمی محتوای اسلامی (قرآن، حدیث، IslamHouse) و سایت‌های تأییدشده.",
  ],
  eval: [
    "چگونه کار می‌کند",
    "دسته‌بندی پرسش (عمومی، اختلافی، مسئله شخصی، فوری)، جست‌وجو در منابع معتبر، دلیل [n]، و نگهبانی که فقط در سه حالت دخالت می‌کند: متن منسوبِ نامطابق با منبع، فتوای شخصی، و نام مدل یا ارائه‌دهنده آن. مسئله شخصی به متخصص ارجاع می‌شود.",
    "آنچه انجام نمی‌دهد",
    "فتوای شخصی نمی‌دهد، متن منسوب جعل نمی‌کند و در وب عمومی جست‌وجو نمی‌کند.",
    "آزمون",
    "با هر تغییر آزمون‌های خودکار اجرا می‌شوند. جدول نتایج به‌زودی اینجا منتشر می‌شود.",
  ],
  privacy: [
    "آنچه جمع می‌کنیم",
    "برای پرسیدن حساب لازم نیست. گفت‌وگوی مهمان در مرورگر خودش می‌ماند. برای حساب: ایمیل، نام، زبان، شهر، و تصویر و معرفی اگر بیفزایید. پرونده مسئله بدون هویت، فقط با کشور.",
    "آنچه جمع نمی‌کنیم",
    "بدون تبلیغ، بدون ردیابی شخص ثالث، بدون فروش داده. متخصص نام یا ایمیل شما را نمی‌بیند.",
    "دریافت و حذف",
    "حساب من ← تنظیمات: داده‌های خود (JSON) را دریافت کنید یا حساب را برای همیشه حذف کنید.",
  ],
  repo: "مخزن در GitHub",
  settings: "تنظیمات",
});

const fr = brief({
  about: [
    "Qu'est-ce que Mustafti ?",
    "Mustafti comprend et clarifie votre question religieuse, répond aux questions générales avec un savoir équilibré et renforce la réponse par des preuves issues de sources approuvées [n]. Mustafti ne délivre pas de fatwa sur un cas personnel ; un cas personnel est transmis à un spécialiste, sans votre identité.",
    "Trois parcours",
    "Musulman : la discussion en page d'accueil. Nouveau musulman : le Guide sur /new-muslim. Non-musulman : le Prédicateur sur /discover.",
    "Spécialistes et sources",
    "Muftis et prédicateurs sont acceptés manuellement après vérification. Les textes cités proviennent uniquement des références approuvées : le serveur officiel de contenu islamique (Coran, hadith, IslamHouse) et les sites agréés.",
  ],
  eval: [
    "Fonctionnement",
    "Classement de la question (générale, controversée, cas personnel, urgente), recherche dans les sources approuvées, preuve [n], puis un garde qui n'intervient que dans trois cas : un texte attribué qui ne correspond pas à la source, une fatwa personnelle, et la mention du nom du modèle ou de son fournisseur. Le cas personnel est transmis à un spécialiste.",
    "Ce qu'il ne fait pas",
    "Pas de fatwa personnelle, pas de citation inventée, pas de recherche sur le web général.",
    "Tests",
    "Des tests automatiques s'exécutent à chaque modification. Le tableau des résultats sera publié ici prochainement.",
  ],
  privacy: [
    "Ce que nous collectons",
    "Pas besoin de compte pour poser une question. La discussion d'un visiteur reste dans son navigateur. Pour un compte : e-mail, nom, langue, ville, photo et présentation si vous les ajoutez. Le dossier d'une question est anonyme, avec le pays seulement.",
    "Ce que nous ne collectons pas",
    "Ni publicité, ni pistage tiers, ni vente de données. Le spécialiste ne voit ni votre nom ni votre e-mail.",
    "Téléchargement et suppression",
    "Mon compte → Paramètres : téléchargez vos données (JSON) ou supprimez définitivement votre compte.",
  ],
  repo: "Dépôt sur GitHub",
  settings: "Paramètres",
});

const ms = brief({
  about: [
    "Apakah Mustafti?",
    "Mustafti memahami dan memperjelas soalan agama anda, menjawab soalan umum dengan ilmu yang seimbang, dan menguatkannya dengan dalil daripada sumber yang diluluskan [n]. Mustafti tidak berfatwa bagi kes peribadi; kes peribadi dirujuk kepada pakar tanpa identiti anda.",
    "Tiga laluan",
    "Muslim: perbualan di laman utama. Mualaf: Pembimbing di /new-muslim. Bukan Muslim: Pendakwah di /discover.",
    "Pakar dan sumber",
    "Mufti dan pendakwah diterima secara manual selepas pengesahan. Teks yang dipetik hanya daripada rujukan rasmi: pelayan kandungan Islam rasmi (al-Quran, hadis, IslamHouse) dan laman yang diluluskan.",
  ],
  eval: [
    "Cara ia berfungsi",
    "Pengelasan soalan (umum, khilaf, kes peribadi, kecemasan), carian sumber rasmi, dalil [n], dan pengawal yang campur tangan dalam tiga keadaan sahaja: petikan yang tidak sepadan dengan sumber, fatwa peribadi, dan sebutan nama model atau pembekalnya. Kes peribadi dirujuk kepada pakar.",
    "Apa yang tidak dilakukan",
    "Tidak berfatwa peribadi, tidak mereka petikan, dan tidak mencari di web umum.",
    "Ujian",
    "Ujian automatik dijalankan pada setiap perubahan. Jadual keputusan akan diterbitkan di sini tidak lama lagi.",
  ],
  privacy: [
    "Apa yang kami kumpul",
    "Bertanya tanpa akaun. Perbualan pelawat kekal dalam pelayarnya. Untuk akaun: e-mel, nama, bahasa, bandar, serta foto dan bio jika ditambah. Fail kes tanpa identiti, hanya negara.",
    "Apa yang tidak kami kumpul",
    "Tiada iklan, tiada penjejakan pihak ketiga, tiada penjualan data. Pakar tidak melihat nama atau e-mel anda.",
    "Muat turun dan padam",
    "Akaun saya → Tetapan: muat turun data anda (JSON) atau padam akaun anda secara kekal.",
  ],
  repo: "Repositori di GitHub",
  settings: "Tetapan",
});

const ru = brief({
  about: [
    "Что такое Мустафти?",
    "Мустафти понимает и уточняет ваш религиозный вопрос, отвечает на общие вопросы взвешенным знанием и подкрепляет ответ доводами из утверждённых источников [n]. Мустафти не выносит фетв по личным случаям: личный случай передаётся специалисту без ваших данных.",
    "Три пути",
    "Мусульманин: чат на главной странице. Новообращённый: Наставник на /new-muslim. Немусульманин: Проповедник на /discover.",
    "Специалисты и источники",
    "Муфтии и проповедники принимаются вручную после проверки. Цитируемые тексты берутся только из утверждённых источников: официальный сервер исламского контента (Коран, хадисы, IslamHouse) и одобренные сайты.",
  ],
  eval: [
    "Как это работает",
    "Классификация вопроса (общий, спорный, личный случай, срочный), поиск в утверждённых источниках, довод [n] и страж, который вмешивается только в трёх случаях: приписываемый текст не совпадает с источником, личная фетва, упоминание названия модели или её поставщика. Личный случай передаётся специалисту.",
    "Чего он не делает",
    "Не выносит личных фетв, не выдумывает цитат и не ищет в общем интернете.",
    "Тестирование",
    "Автоматические тесты запускаются при каждом изменении. Таблица результатов скоро будет опубликована здесь.",
  ],
  privacy: [
    "Что мы собираем",
    "Для вопроса аккаунт не нужен. Чат гостя остаётся в его браузере. Для аккаунта: e-mail, имя, язык, город, а также фото и описание, если вы их добавите. Файл вопроса анонимен, указывается только страна.",
    "Что мы не собираем",
    "Никакой рекламы, стороннего отслеживания и продажи данных. Специалист не видит вашего имени и e-mail.",
    "Скачивание и удаление",
    "Мой аккаунт → Настройки: скачайте свои данные (JSON) или удалите аккаунт навсегда.",
  ],
  repo: "Репозиторий на GitHub",
  settings: "Настройки",
});

const sw = brief({
  about: [
    "Mustafti ni nini?",
    "Mustafti huelewa na kufafanua swali lako la kidini, hujibu maswali ya jumla kwa elimu yenye usawa, na huimarisha jibu kwa dalili kutoka vyanzo vilivyoidhinishwa [n]. Mustafti haitoi fatwa kwa hali ya mtu binafsi; hali binafsi hupelekwa kwa mtaalamu bila utambulisho wako.",
    "Njia tatu",
    "Muislamu: mazungumzo kwenye ukurasa wa mwanzo. Muislamu mpya: Mwongozi kwenye /new-muslim. Asiye Muislamu: Mlinganiaji kwenye /discover.",
    "Wataalamu na vyanzo",
    "Mamufti na walinganiaji hukubaliwa kwa mkono baada ya uthibitisho. Maandiko yanayonukuliwa hutoka tu kwenye marejeo rasmi: seva rasmi ya maudhui ya Kiislamu (Qur'ani, hadithi, IslamHouse) na tovuti zilizoidhinishwa.",
  ],
  eval: [
    "Jinsi inavyofanya kazi",
    "Kuainisha swali (la jumla, lenye tofauti, hali binafsi, la dharura), kutafuta katika vyanzo rasmi, dalili [n], na mlinzi anayeingilia katika hali tatu tu: nukuu isiyolingana na chanzo, fatwa binafsi, na kutaja jina la modeli au mtoaji wake. Hali binafsi hupelekwa kwa mtaalamu.",
    "Isichofanya",
    "Haitoi fatwa binafsi, haitungi nukuu, na haitafuti kwenye mtandao wa jumla.",
    "Majaribio",
    "Majaribio ya kiotomatiki huendeshwa kwa kila mabadiliko. Jedwali la matokeo litachapishwa hapa hivi karibuni.",
  ],
  privacy: [
    "Tunachokusanya",
    "Huhitaji akaunti kuuliza. Mazungumzo ya mgeni hubaki kwenye kivinjari chake. Kwa akaunti: barua pepe, jina, lugha, mji, na picha na wasifu ukiongeza. Faili la swali halina utambulisho, nchi tu.",
    "Tusichokusanya",
    "Hakuna matangazo, ufuatiliaji wa watu wengine, wala uuzaji wa data. Mtaalamu haoni jina wala barua pepe yako.",
    "Kupakua na kufuta",
    "Akaunti yangu → Mipangilio: pakua data yako (JSON) au futa akaunti yako kabisa.",
  ],
  repo: "Hazina kwenye GitHub",
  settings: "Mipangilio",
});

const ha = brief({
  about: [
    "Menene Mustafti?",
    "Mustafti yana fahimta kuma yana fayyace tambayarka ta addini, yana amsa tambayoyi na gama-gari da ilimi mai daidaito, kuma yana karfafa amsar da hujja daga majiyoyi da aka amince da su [n]. Mustafti ba ya bayar da fatawa kan lamarin mutum na kashin kansa; ana mika lamarin ga kwararre ba tare da bayyana ko kai wane ne ba.",
    "Hanyoyi uku",
    "Musulmi: tattaunawa a shafin farko. Sabon Musulmi: Jagora a /new-muslim. Wanda ba Musulmi ba: Mai da'awa a /discover.",
    "Kwararru da majiyoyi",
    "Ana karbar malamai da masu da'awa da hannu bayan tantancewa. Nassin da aka ruwaito yana zuwa ne kawai daga majiyoyin da aka amince da su: sabar abun cikin Musulunci ta hukuma (Alkur'ani, hadisi, IslamHouse) da shafukan da aka amince da su.",
  ],
  eval: [
    "Yadda yake aiki",
    "Rarraba tambaya (gama-gari, mai sabani, lamarin kashin kai, gaggawa), bincike a majiyoyin hukuma, hujja [n], da mai gadi wanda ke shiga tsakani a hali uku kawai: nassin da aka danganta wanda bai dace da majiya ba, fatawa ta kashin kai, da ambaton sunan samfurin ko mai samar da shi. Ana mika lamarin kashin kai ga kwararre.",
    "Abin da ba ya yi",
    "Ba ya bayar da fatawa ta kashin kai, ba ya kirkirar nassi, kuma ba ya bincike a yanar gizo gaba daya.",
    "Gwaji",
    "Gwaje-gwaje na atomatik suna gudana a kowane canji. Za a wallafa teburin sakamako a nan ba da jimawa ba.",
  ],
  privacy: [
    "Abin da muke tattarawa",
    "Ba ka bukatar asusu don yin tambaya. Tattaunawar bako tana zama a burauzarsa. Don asusu: imel, suna, harshe, gari, da hoto da takaitaccen bayani idan ka kara. Fayil din tambaya ba shi da bayanan mutum, sai kasa kawai.",
    "Abin da ba mu tattarawa",
    "Babu talla, babu bin diddigin wasu kamfanoni, babu sayar da bayanai. Kwararre ba ya ganin sunanka ko imel dinka.",
    "Saukewa da gogewa",
    "Asusuna → Saituna: sauke bayananka (JSON) ko goge asusunka har abada.",
  ],
  repo: "Ma'ajiya a GitHub",
  settings: "Saituna",
});

export const PAGE_CONTENT: Record<Locale, Record<InfoPage, PageContent>> = { ar, en, id, ur, bn, tr, fa, fr, ms, ru, sw, ha };

/** محتوى الصفحة بلغة الواجهة (والإنجليزية احتياطاً). */
export function pageContent(locale: string, page: InfoPage): PageContent {
  return (PAGE_CONTENT[locale as Locale] ?? en)[page];
}
