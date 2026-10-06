import type { Locale } from "@/i18n/locales";
import { PRIVACY } from "./privacy";

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

/** updated: سطر «آخر تحديث» أعلى الصفحة. topLink: زر في أعلى الصفحة (F1b: المستودع في /eval). */
export type PageContent = { sections: PageSection[]; updated?: string; topLink?: { label: string; href: string } };

export type InfoPage = "about" | "eval" | "privacy";

const ar: Record<Exclude<InfoPage, "privacy">, PageContent> = {
  about: {
    sections: [
      {
        title: "ما مُستفتي؟",
        paras: [
          "مُستفتي منصة تفهم سؤالك الديني وتستوضحه، ثم تجيبك عن الأسئلة العامة بعلم مسلم متزن، وتقوّي الجواب بالدليل من المصادر المعتمدة برقم [n] يفتح النص ورابطه الأصلي.",
          "مُستفتي لا يُفتي: لا يُصدر حكماً شرعياً في حالتك الشخصية. إن كان سؤالك واقعة تخصك يختلف حكمها بتفاصيلها، استوضح أركانها وأعدّ لك «ملف مسألة» بلا هوية، وأحاله إلى مختص.",
          "الواجهة بالعربية والإنجليزية، وعشر لغات قيد الإكمال، والمحادثة تجيب بأي لغة تكتب بها.",
        ],
      },
      {
        title: "لمن؟",
        paras: ["لكل سائل، بلا تسجيل: المسلم، ومن أسلم حديثاً، ومن يريد أن يتعرّف على الإسلام. الواجهة بالعربية والإنجليزية، وعشر لغات قيد الإكمال، والمحادثة تجيب بأي لغة تكتب بها."],
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
        title: "مفتوح المصدر",
        paras: ["الكود كله منشور للاطلاع والتقييم."],
        link: { label: "المستودع على GitHub", href: REPO_URL },
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
    topLink: { label: "المستودع على GitHub", href: REPO_URL },
    sections: [
      {
        title: "كيف يعمل",
        items: [
          "التصنيف: كل سؤال يُصنَّف أولاً بلغته ونوع السائل ومستواه: عام (أ، ب)، أو خلافي (ج)، أو حالة شخصية (د)، أو عاجل.",
          "المصادر: يُبحث عن النصوص ذات الصلة في المرجعية المعتمدة وحدها (خادم المحتوى الرسمي، والمواقع المعتمدة، والفتاوى المنشورة).",
          "الدليل [n]: المساعد يجيب بعلمه كاملاً، ويستشهد بالمصادر برقم [n] حيث تنطبق. كل رقم يفتح بطاقة النص بحروفه ورابطه الأصلي.",
          "الحارس: يفحص كل جملة قبل أن تصلك، ويتدخل في ثلاث حالات فقط: (1) نص منسوب (آية أو حديث أو قول عالم) لا يطابق مصدراً مسترجعاً: يُصحَّح إلى نص المصدر، أو يُذكر معناه بلا نسبة؛ (2) فتوى شخصية لحالة فردية: تُمنع ويُحال السائل؛ (3) ذكر اسم النموذج أو الشركة المزوّدة، أو محتوى مسيء: تُحذف جملته.",
          "اللغات: الواجهة بالعربية والإنجليزية، وعشر لغات قيد الإكمال؛ والمحادثة تجيب بلغة السائل أياً كانت.",
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
};

const en: Record<Exclude<InfoPage, "privacy">, PageContent> = {
  about: {
    sections: [
      {
        title: "What is Mustafti?",
        paras: [
          "Mustafti understands your religious question and clarifies it, then answers general questions with balanced Muslim knowledge, strengthened by evidence from approved sources: each [n] opens the quoted text and its original link.",
          "Mustafti does not issue fatwas: it never rules on your personal case. If your question is a personal matter whose ruling depends on its details, it clarifies the key facts, prepares an anonymous case file, and refers it to a qualified specialist.",
          "The interface is in Arabic and English, with ten more languages in progress, and the chat answers in whatever language you write in.",
        ],
      },
      {
        title: "Who is it for?",
        paras: ["Anyone, with no sign-up needed: Muslims, new Muslims, and anyone curious about Islam. The interface is in Arabic and English, with ten more languages in progress, and the chat answers in whatever language you write in."],
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
        title: "Open source",
        paras: ["All the code is published for review and evaluation."],
        link: { label: "Repository on GitHub", href: REPO_URL },
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
    topLink: { label: "Repository on GitHub", href: REPO_URL },
    sections: [
      {
        title: "How it works",
        items: [
          "Classification: each question is first classified by language, asker type and level: general (A, B), disputed (C), personal case (D), or urgent.",
          "Sources: relevant texts are retrieved from the approved references only (the official content server, approved sites and published fatwas).",
          "Evidence [n]: the assistant answers fully from its knowledge and cites sources with [n] where they apply. Each number opens a card with the exact text and its original link.",
          "The guard checks every sentence before it reaches you and acts in three cases only: (1) an attributed text (verse, hadith or scholar's words) that does not match a retrieved source is corrected to the source text, or given by meaning without attribution; (2) a personal fatwa on an individual case is blocked and the asker is referred; (3) a mention of the model's name or its provider, or offensive content, is removed.",
          "Languages: the interface is in Arabic and English, with ten more languages in progress; the chat answers in the asker's language, whatever it is.",
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
};

/** ترجمة مختصرة لـ about وeval (أربعة أقسام وثلاثة) بالعبارات الأساسية، والروابط كما في العربية والإنجليزية. */
function brief(t: {
  about: [string, string, string, string, string, string];
  eval: [string, string, string, string, string, string];
  repo: string;
  settings: string;
  /** F1b: «مفتوح المصدر»: العنوان والسطر. */
  open: [string, string];
}): Record<Exclude<InfoPage, "privacy">, PageContent> {
  return {
    about: {
      sections: [
        { title: t.about[0], paras: [t.about[1]] },
        { title: t.about[2], paras: [t.about[3]] },
        { title: t.about[4], paras: [t.about[5]] },
        { title: t.open[0], paras: [t.open[1]], link: { label: t.repo, href: REPO_URL } },
      ],
    },
    eval: {
      topLink: { label: t.repo, href: REPO_URL },
      sections: [
        { title: t.eval[0], paras: [t.eval[1]] },
        { title: t.eval[2], paras: [t.eval[3]] },
        { title: t.eval[4], paras: [t.eval[5]], link: { label: t.repo, href: REPO_URL } },
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
  open: ["Sumber terbuka", "Seluruh kode dipublikasikan untuk ditinjau dan dinilai."],
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
  open: ["اوپن سورس", "سارا کوڈ جائزے اور جانچ کے لیے شائع ہے۔"],
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
  open: ["ওপেন সোর্স", "পুরো কোড পর্যালোচনা ও মূল্যায়নের জন্য প্রকাশিত।"],
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
  open: ["Açık kaynak", "Kodun tamamı incelenmek ve değerlendirilmek üzere yayımlanmıştır."],
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
  open: ["متن‌باز", "همه کد برای بررسی و ارزیابی منتشر شده است."],
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
  open: ["Code ouvert", "Tout le code est publié pour consultation et évaluation."],
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
  open: ["Sumber terbuka", "Seluruh kod diterbitkan untuk semakan dan penilaian."],
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
  open: ["Открытый код", "Весь код опубликован для ознакомления и оценки."],
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
  open: ["Chanzo huria", "Msimbo wote umechapishwa kwa ajili ya kukaguliwa na kutathminiwa."],
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
  open: ["Bude tushe", "An wallafa dukkan lambar don dubawa da tantancewa."],
  repo: "Ma'ajiya a GitHub",
  settings: "Saituna",
});

const BASE: Record<Locale, Record<Exclude<InfoPage, "privacy">, PageContent>> = { ar, en, id, ur, bn, tr, fa, fr, ms, ru, sw, ha };

/** F1b: الخصوصية سياسة كاملة في privacy.ts. */
export const PAGE_CONTENT = Object.fromEntries(
  (Object.keys(BASE) as Locale[]).map((l) => [l, { ...BASE[l], privacy: PRIVACY[l] }]),
) as Record<Locale, Record<InfoPage, PageContent>>;

/** محتوى الصفحة بلغة الواجهة (والإنجليزية احتياطاً). */
export function pageContent(locale: string, page: InfoPage): PageContent {
  return (PAGE_CONTENT[locale as Locale] ?? PAGE_CONTENT.en)[page];
}
