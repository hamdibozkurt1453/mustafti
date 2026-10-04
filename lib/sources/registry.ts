import type { AccessKind, SourceId } from "./types";

/**
 * سجل المصادر: كل مصدر مذكور في «المرجعية والحزمة العلمية والبيانات» (نسخة 1448/3/20)،
 * ولا مصدر غيره (CLAUDE.md، القاعدة 2). «قاعدة الاستخدام» منقولة من المرجعية بنصها
 * أو بمعناها القريب، وتُعرض في /api/health وتُمرَّر لاحقاً إلى تعليمات النموذج.
 *
 * طريقة الوصول بالترتيب المعتمد: MCP ثم API عام بلا مفتاح ثم البحث المباشر في الموقع.
 * «link_only»: مرجع يُستشهد برابطه فقط الآن (تنزيل كتب، أو واجهة بمفتاح، أو فهرسة محلية لاحقاً).
 */
export type SourceDef = {
  id: SourceId;
  /** الاسم كما في المرجعية. */
  name: string;
  nameEn: string;
  url: string;
  /** المجال في المرجعية. */
  domain: string;
  /** قاعدة الاستخدام من المرجعية. */
  rule: string;
  /** طرق الوصول المفعّلة بالترتيب (التنفيذ في connectors.ts). فارغة = رابط فقط. */
  access: AccessKind[];
  /** مدخل المرجعية: منصات الجمعية، أو رسالة الحرمين، أو المنصات المتخصصة. */
  group: "association" | "haramain" | "specialized" | "core";
  /** لغات بحث الموقع (إن كان البحث المباشر لا يدعم لغة السائل نبحث بالعربية). */
  langs?: string[];
  note?: string;
};

const TRANSLATION_RULE =
  "الاعتماد في الترجمات المعتمدة على منصات الجمعية ومنصة رسالة الحرمين (المرجعية، ص 11).";
const EXTERNAL_NOTE =
  "منصة متخصصة خارج الجمعية: توصي الجمعية بالإفادة من محتواها دون أن تكون مسؤولة عنه (المرجعية، ص 11).";

export const SOURCES: SourceDef[] = [
  // ---------------------------------------------------------------- منصات الجمعية (لها خادم MCP)
  {
    id: "quranenc",
    name: "موسوعة القرآن الكريم",
    nameEn: "Quran Encyclopedia (QuranEnc)",
    url: "https://quranenc.com",
    domain: "القرآن الكريم وترجمات معانيه",
    rule: "أهمية التأكد من موثوقية نقل الآيات؛ النص القرآني بالرسم المعتمد مع ترجمة معتمدة لكل لغة.",
    access: ["mcp", "api"],
    group: "association",
    note: "API: ترجمة آية بعينها عند ذكر رقمها (مثل 2:255).",
  },
  {
    id: "hadeethenc",
    name: "موسوعة الأحاديث النبوية",
    nameEn: "Encyclopedia of Translated Prophetic Hadiths (HadeethEnc)",
    url: "https://hadeethenc.com",
    domain: "الحديث النبوي وشروحه",
    rule: "لا يُنسب حديث دون مصدر وحكم معتمد في البيانات.",
    access: ["mcp", "site"],
    group: "association",
  },
  {
    id: "byenah",
    name: "موقع بيان الإسلام",
    nameEn: "Bayan Al-Islam (Byenah)",
    url: "https://byenah.com",
    domain: "التعريف بالإسلام وتعليمه للمسلمين وغير المسلمين",
    rule: "الالتزام بما عليه المسلمون خصوصاً الصحابة والتابعون ومن تبعهم.",
    access: ["mcp", "site"],
    group: "association",
  },
  {
    id: "islamhouse",
    name: "موقع دار الإسلام (IslamHouse)",
    nameEn: "IslamHouse",
    url: "https://islamhouse.com",
    domain: "كتب ومقالات وفتاوى منشورة وصوتيات ومرئيات بأكثر من 130 لغة",
    rule: "الالتزام بما عليه المسلمون خصوصاً الصحابة والتابعون ومن تبعهم. " + TRANSLATION_RULE,
    access: ["mcp", "site"],
    group: "association",
  },
  {
    id: "islamenc",
    name: "موسوعة المحتوى الإسلامي باللغات",
    nameEn: "Islamic Content Encyclopedia (IslamEnc)",
    url: "https://islamenc.com/ar",
    domain: "أسئلة وأجوبة، وأسماء حسنى، ومصطلحات، وأعلام، بأكثر من 100 لغة",
    rule: TRANSLATION_RULE,
    access: ["mcp", "site"],
    group: "association",
  },
  {
    id: "terminologyenc",
    name: "موسوعة المصطلحات الإسلامية",
    nameEn: "Islamic Terminology Encyclopedia",
    url: "https://terminologyenc.com",
    domain: "الترجمة والمصطلحات",
    rule: "يُقدَّم على الترجمة التلقائية في المصطلحات الشرعية الحساسة.",
    access: ["mcp", "site"],
    group: "association",
  },
  {
    id: "icadb",
    name: "القاعدة المركزية للمحتوى الإسلامي باللغات",
    nameEn: "Central Islamic Content Database (ICADB)",
    url: "https://icadb.com",
    domain: "الترجمات المعتمدة بمحاذاة على مستوى الجملة",
    rule: TRANSLATION_RULE,
    access: [],
    group: "association",
    note: "واجهة التكامل icadb.com/api/docs: تُفعَّل في جلسة الترجمة بعد التحقق من شروطها.",
  },
  // ---------------------------------------------------------------- رسالة الحرمين
  {
    id: "risala",
    name: "رسالة الحرمين",
    nameEn: "Risalat Al-Haramain",
    url: "https://risala.prh.gov.sa",
    domain: "محتوى إرشادي شرعي معتمد لقاصدي الحرمين بأكثر من 80 لغة",
    rule: "محتوى معتمد من رئاسة الشؤون الدينية للمسجد الحرام والمسجد النبوي. " + TRANSLATION_RULE,
    access: ["api"],
    group: "haramain",
  },
  // ---------------------------------------------------------------- المرجعية العلمية المعتمدة
  {
    id: "dawa_center",
    name: "المستودع الدعوي الرقمي (ومنه «بيّنات»)",
    nameEn: "Dawa Center (incl. Bayyinat Q&A)",
    url: "https://dawa.center",
    domain: "الموضوعات الدعوية، والشبهات والأسئلة المتكررة",
    rule: "«بيّنات» مصدر أساسي للحلول الحوارية في الشبهات (dawa.center/file/7937)؛ ويُرجع إلى المستودع في الدعوة حسب البلدان والأديان واللغات والفئات.",
    access: ["site"],
    group: "core",
    note: "«بيّنات» تُفهرس محلياً في جلسة لاحقة.",
  },
  {
    id: "jamhara",
    name: "الجمهرة — موسوعة مفردات المحتوى الإسلامي",
    nameEn: "Al-Jamhara (Islamic Content Vocabulary)",
    url: "https://islamic-content.com",
    domain: "الترجمة والمصطلحات، والموضوعات الدعوية",
    rule: "يُقدَّم على الترجمة التلقائية في المصطلحات الشرعية الحساسة (islamic-content.com/dictionary).",
    access: ["site"],
    group: "core",
  },
  {
    id: "quranpedia",
    name: "موسوعة القرآن (Quranpedia)",
    nameEn: "Quranpedia",
    url: "https://quranpedia.net",
    domain: "القرآن الكريم",
    rule: "أهمية التأكد من موثوقية نقل الآيات.",
    access: ["site"],
    group: "core",
  },
  {
    id: "qurancomplex",
    name: "مجمع الملك فهد لطباعة المصحف الشريف",
    nameEn: "King Fahd Glorious Quran Printing Complex",
    url: "https://qurancomplex.gov.sa",
    domain: "النص القرآني المعتمد وترجماته",
    rule: "أهمية التأكد من موثوقية نقل الآيات؛ طبعة المجمع وترجماته معتمدة.",
    access: [],
    group: "core",
    note: "نص المصحف للمطورين (XML/JSON) عبر منصة المطورين؛ الآيات تُجلب الآن من quranenc عبر MCP.",
  },
  {
    id: "dorar_hadith",
    name: "الدرر السنية — الموسوعة الحديثية",
    nameEn: "Dorar — Hadith Encyclopedia",
    url: "https://dorar.net/hadith",
    domain: "الحديث النبوي",
    rule: "لا يُنسب حديث دون مصدر وحكم معتمد في البيانات.",
    access: ["api"],
    group: "core",
    langs: ["ar"],
    note: "واجهة البحث الحديثي JSON (dorar.net/article/389)، وتعيد حكم المحدث مع كل حديث.",
  },
  {
    id: "dorar_tafseer",
    name: "الدرر السنية — موسوعة التفسير",
    nameEn: "Dorar — Tafseer",
    url: "https://dorar.net/tafseer",
    domain: "التفسير",
    rule: "يُستخدم لشرح الآية مع تمييز كلام المفسر عن النص القرآني.",
    access: ["site"],
    group: "core",
    langs: ["ar"],
  },
  {
    id: "dorar_aqeeda",
    name: "الدرر السنية — الموسوعة العقدية",
    nameEn: "Dorar — Aqeeda",
    url: "https://dorar.net/aqeeda",
    domain: "العقيدة والتعريف بالإسلام",
    rule: "الالتزام بما عليه المسلمون خصوصاً الصحابة والتابعون ومن تبعهم.",
    access: ["site"],
    group: "core",
    langs: ["ar"],
  },
  {
    id: "dorar_feqhia",
    name: "الدرر السنية — الموسوعة الفقهية",
    nameEn: "Dorar — Fiqh",
    url: "https://dorar.net/feqhia",
    domain: "الفقه العام",
    rule: "لا تتحول إلى فتوى شخصية أو ترجيح آلي مستقل.",
    access: ["site"],
    group: "core",
    langs: ["ar"],
  },
  {
    id: "dorar_history",
    name: "الدرر السنية — الموسوعة التاريخية",
    nameEn: "Dorar — History",
    url: "https://dorar.net/history",
    domain: "السيرة والتاريخ",
    rule: "تعتمد الوقائع الثابتة وتحدد درجة ما يحتاج إلى احتراز.",
    access: ["site"],
    group: "core",
    langs: ["ar"],
  },
  {
    id: "shamela",
    name: "المكتبة الشاملة",
    nameEn: "Al-Maktaba Al-Shamela",
    url: "https://shamela.ws",
    domain: "كتب السنة والتراث (الطبعات المعتمدة)",
    rule: "لا يُنسب حديث دون مصدر وحكم معتمد في البيانات؛ يُرجع إلى الطبعات المعتمدة لكتب السنة.",
    access: ["site"],
    group: "core",
    langs: ["ar"],
  },
  // ---------------------------------------------------------------- منصات متخصصة خارج الجمعية
  {
    id: "tafsir_net",
    name: "مركز تفسير للدراسات القرآنية",
    nameEn: "Tafsir Center for Quranic Studies",
    url: "https://tafsir.net",
    domain: "القرآن الكريم وعلومه",
    rule: "يُستخدم لشرح الآية مع تمييز كلام المفسر عن النص القرآني. " + EXTERNAL_NOTE,
    access: ["site"],
    group: "specialized",
    langs: ["ar"],
  },
  {
    id: "modoee",
    name: "التفسير الموضوعي (مركز تفسير)",
    nameEn: "Thematic Tafsir (modoee.com)",
    url: "https://modoee.com",
    domain: "القرآن الكريم وعلومه",
    rule: "يُستخدم لشرح الآية مع تمييز كلام المفسر عن النص القرآني. " + EXTERNAL_NOTE,
    access: [],
    group: "specialized",
  },
  {
    id: "surahapp",
    name: "مصحف سورة",
    nameEn: "Surah App",
    url: "https://surahapp.com",
    domain: "القرآن الكريم وعلومه",
    rule: "مبني على مصحف المجمع. " + EXTERNAL_NOTE,
    access: [],
    group: "specialized",
  },
  {
    id: "wahy",
    name: "وحي",
    nameEn: "Wahy",
    url: "https://wahy.net",
    domain: "القرآن الكريم وعلومه",
    rule: EXTERNAL_NOTE,
    access: [],
    group: "specialized",
  },
  {
    id: "mp3quran",
    name: "المكتبة الصوتية للقرآن الكريم",
    nameEn: "MP3Quran",
    url: "https://mp3quran.net",
    domain: "التلاوات القرآنية",
    rule: EXTERNAL_NOTE,
    access: ["api"],
    group: "specialized",
    note: "واجهة عامة مجانية بلا مفتاح (mp3quran.net/api): البحث في أسماء القرّاء.",
  },
  {
    id: "kuwait_fiqh",
    name: "الموسوعة الفقهية الكويتية",
    nameEn: "Kuwaiti Fiqh Encyclopedia",
    url: "https://bohoth.awqaf.gov.kw",
    domain: "الفقه العام (مرجع لضبط المصطلحات الفقهية)",
    rule: "لا تتحول إلى فتوى شخصية أو ترجيح آلي مستقل. " + EXTERNAL_NOTE,
    access: [],
    group: "specialized",
    note: "تُنزَّل مجلداتها (Word/PDF)؛ تُستعمل لقوالب الأركان باستخراج يدوي موثق بالمجلد والصفحة.",
  },
  {
    id: "islamqa",
    name: "الإسلام سؤال وجواب",
    nameEn: "IslamQA",
    url: "https://islamqa.info",
    domain: "الفتاوى المنشورة (17 لغة)",
    rule: "فتاوى منشورة منسوبة لأصحابها؛ لا تُعرض حكماً على حالة السائل (ميزة «الفتوى المطابقة» متوقفة). " + EXTERNAL_NOTE,
    access: ["site"],
    group: "specialized",
    langs: ["ar", "en", "id", "tr", "fr", "ur", "bn", "ru", "es", "fa", "hi", "de", "pt", "zh", "ug", "ja", "tg"],
  },
  {
    id: "binbaz",
    name: "موقع الشيخ عبدالعزيز بن باز",
    nameEn: "Sheikh Ibn Baz Official Website",
    url: "https://binbaz.org.sa",
    domain: "الفتاوى المنشورة والكتب والصوتيات",
    rule: "فتاوى منشورة منسوبة لصاحبها؛ لا تُعرض حكماً على حالة السائل. " + EXTERNAL_NOTE,
    access: ["site"],
    group: "specialized",
    langs: ["ar"],
  },
  {
    id: "binothaimeen",
    name: "موقع الشيخ محمد بن صالح العثيمين",
    nameEn: "Sheikh Ibn Uthaymeen Official Website",
    url: "https://binothaimeen.net",
    domain: "الفتاوى المنشورة والكتب والشروح",
    rule: "فتاوى منشورة منسوبة لصاحبها؛ لا تُعرض حكماً على حالة السائل. " + EXTERNAL_NOTE,
    access: ["site"],
    group: "specialized",
    langs: ["ar"],
  },
  {
    id: "ksaa",
    name: "مجمع الملك سلمان العالمي للغة العربية (معجم الرياض، وسوار، وفلك)",
    nameEn: "King Salman Global Academy for Arabic Language",
    url: "https://ksaa.gov.sa",
    domain: "اللغة العربية والمعاجم والمصطلحات",
    rule: "يُفاد منها في ضبط المصطلح العربي ومقابلاته عند الترجمة وبناء القواميس. " + EXTERNAL_NOTE,
    access: [],
    group: "specialized",
    note: "واجهة سوار للمطورين تتطلب مفتاحاً، فتبقى رابطاً حتى الحاجة إليها.",
  },
];

export const SOURCE_BY_ID = Object.fromEntries(SOURCES.map((s) => [s.id, s])) as Record<SourceId, SourceDef>;

/** خادم MCP نفسه (العمود الفقري)، يظهر أولاً في /api/health. */
export const MCP_SOURCE = {
  name: "خادم MCP الرسمي لجمعية خدمة المحتوى الإسلامي باللغات",
  rule: "لا فتاوى: يسترجع النص المنشور فقط، وكل نتيجة تحمل رابط مصدرها.",
};
