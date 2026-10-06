/**
 * F2b: «المحادثة العادية» — التحية والشكر والوداع والسؤال عن المنصة والكلام العادي.
 * لا تمر على المصنّف ولا الاسترجاع ولا الحارس: تذهب مباشرة إلى شخصية الصفحة لرد قصير دافئ بلغة السائل،
 * مع ثلاثة أسئلة مقترحة (respond.ts). هنا الكشف بالكود والردود الاحتياطية الثابتة (ملف نقي للاختبار).
 *
 * الكشف محافظ: الرسالة كلها عبارات محادثة (قد تتوالى: «السلام عليكم، كيف حالك؟»)، فإن كان فيها سؤال
 * ديني («السلام عليكم، ما حكم…») فلا تُعد محادثة عادية وتمضي في مسارها.
 */

import type { ChatMode } from "./modes";

export const SMALL_TALK_KINDS = ["greeting", "thanks", "about_platform", "farewell", "small_talk"] as const;
export type SmallTalkKind = (typeof SMALL_TALK_KINDS)[number];

/** أقصى طول لرسالة محادثة عادية (بعد التنظيف). */
const MAX_CHARS = 80;

/** حروف الأردية والفارسية بمقابلها العربي (ی ← ي، ک ← ك، ہ ← ه)، في النص وفي العبارات معاً. */
const foldLetters = (s: string) => s.replace(/[یى]/g, "ي").replace(/ک/g, "ك").replace(/[ہۀ]/g, "ه").replace(/ۃ/g, "ه");

/** توحيد: بلا تشكيل ولا تطويل، والهمزات ألفاً، والتاء المربوطة هاءً، وحروف صغيرة، وبلا علامات ولا رموز تعبيرية. */
export function normalizeTalk(text: string): string {
  return foldLetters(text.normalize("NFC").toLowerCase())
    .replace(/[ً-ٰٕـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[’`´]/g, "'")
    .replace(/\p{Extended_Pictographic}|️|‍/gu, " ")
    .replace(/[.,!?؟،؛;:…"«»()[\]{}*~_|/\\]+/g, " ")
    .replace(/(^|\s)-+|-+(\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Phrase = { kind: SmallTalkKind; re: string };
const P = (kind: SmallTalkKind, ...res: string[]): Phrase[] => res.map((re) => ({ kind, re }));

/** عبارات بعد التوحيد (normalizeTalk). كل عبارة تطابق كلمات كاملة من بداية الباقي. */
const PHRASES: Phrase[] = [
  // ---- عن المنصة (أولاً: «مرحبا، من أنت؟» تعريف بالمنصة)
  ...P(
    "about_platform",
    "(?:من|مين) (?:انت|انتم|تكون)",
    "(?:ماذا|ما الذي|شو|ايش|وش) (?:تستطيع|يمكنك|تقدر|تفعل|تعمل)(?: ان (?:تفعل|تعمل|تقدم))?(?: لي)?",
    "ما (?:هو|هي) (?:مستفتي|هذا الموقع|هذه المنصه|المنصه)",
    "ما (?:هذا الموقع|هذه المنصه)",
    "كيف (?:تعمل|يعمل الموقع|تعمل المنصه)",
    "عرف(?:نا)? (?:بنفسك|عن نفسك)",
    "who (?:are|r) (?:you|u)",
    "what (?:can|do) you do",
    "what (?:are|r) you",
    "what is (?:mustafti|this (?:site|website|app|platform))",
    "how (?:do|does) (?:you|this|it) work",
    "introduce yourself",
    "(?:sen|siz) kimsin(?:iz)?",
    "ne(?:ler)? yapabilirsin",
    "qui es[- ]tu",
    "qui [eê]tes[- ]vous",
    "que (?:peux|sais)[- ]tu faire",
    "siapa (?:kamu|anda|awak)",
    "apa (?:yang )?(?:bisa|boleh) (?:kamu|anda|awak) (?:lakukan|buat)",
    "(?:آپ|تم) کون (?:ہیں|ہو)",
    "(?:تو|شما) کی (?:هستی|هستید)",
    "кто ты",
    "что ты (?:умеешь|можешь)",
  ),
  // ---- الشكر
  ...P(
    "thanks",
    "شكرا(?: جزيلا| لك| لكم| كثيرا)?",
    "مشكور(?:ين)?",
    "(?:جزاك|جزاكم|جزاكي) الله (?:خيرا|خير|كل خير)(?: الجزاء)?",
    "بارك الله (?:فيك|فيكم|فيكي)",
    "(?:الله )?يعطيك العافيه",
    "الله يجزاك خير",
    "احسنت(?:م)?",
    "thank(?:s| you)(?: so much| very much| a lot)?",
    "(?:many )?thanks",
    "thx|ty|tysm",
    "jazak(?:a|i)?(?: ?allah)?(?:u)?(?: ?khair(?:an)?| ?khayr(?:an)?)?",
    "barak ?allahu? (?:feek|fik|feeki|feekum)",
    "teşekkürler|teşekkür ederim|sağ ?ol(?:un)?|allah razı olsun",
    "merci(?: beaucoup| bien)?",
    "terima ?kasih(?: banyak)?|makasih",
    "شکریہ|جزاک اللہ(?: خیر)?",
    "ممنون(?:م)?|مرسی|سپاس(?:گزارم)?|متشکرم",
    "спасибо(?: большое)?",
    "ধন্যবাদ",
    "asante(?: sana)?",
    "na gode",
  ),
  // ---- الوداع
  ...P(
    "farewell",
    "مع السلامه",
    "في امان الله",
    "الي اللقاء",
    "وداعا",
    "تصبح(?:ين)? علي خير",
    "(?:good ?)?bye(?: bye)?",
    "see (?:you|ya)(?: later| soon)?",
    "take care",
    "good night",
    "hoşça ?kal|görüşürüz|iyi geceler",
    "au revoir|à bientôt|a bientot|bonne nuit",
    "sampai jumpa|selamat tinggal|dadah",
    "خدا حافظ|اللہ حافظ",
    "خداحافظ",
    "пока|до свидания",
    "kwaheri",
    "sai anjima",
  ),
  // ---- التحية
  ...P(
    "greeting",
    "(?:ال)?سلام عليكم(?: و ?رحمه الله(?: و ?بركاته)?)?",
    "وعليكم السلام(?: و ?رحمه الله(?: و ?بركاته)?)?",
    "السلام",
    "سلام",
    "مرحبا(?: بك| بكم)?|مرحبتين|مراحب",
    "اهلا(?: و ?سهلا)?(?: بك| بكم)?",
    "(?:يا )?هلا(?: و ?الله)?",
    "صباح (?:الخير|النور|الورد)",
    "مساء (?:الخير|النور)",
    "حياك(?:م)? الله",
    "هاي|هلو|هالو",
    "(?:hello|hi|hey|hiya|howdy|greetings|yo)(?: there| everyone| all)?",
    "good (?:morning|afternoon|evening|day)",
    "peace be upon you",
    "(?:as|a|al)?[- ']?sala(?:a)?m(?:u|o)?(?: |[- '])?(?:a|ah)?la(?:i|y)?k(?:u|o)?m(?: wa ?rahmatullahi?(?: wa ?barakatuh?u?)?)?",
    "sala(?:a)?m",
    "merhaba|selam(?:lar)?|selam(?:ün|un)? ?aleyk(?:ü|u)m|esselam(?:ü|u) ?aleyk(?:ü|u)m|günaydın|iyi (?:akşamlar|günler)",
    "bonjour|bonsoir|salut|coucou",
    "halo|hai|helo|selamat (?:pagi|siang|sore|malam|petang)|assalamualaikum",
    "السلام علیکم|ہیلو",
    "درود",
    "привет|здравствуй(?:те)?|ассаляму? алейкум",
    "আসসালামু আলাইকুম|হ্যালো",
    "habari(?: yako| za asubuhi)?|jambo|hujambo|salamu alaykum",
    "sannu|ina kwana",
  ),
  // ---- الكلام العادي
  ...P(
    "small_talk",
    "كيف (?:حالك|الحال|حالكم|انت)",
    "كيفك|شلونك|اخبارك|ازيك|عامل ايه",
    "(?:انا )?بخير(?: و ?الحمد لله)?",
    "الحمد لله",
    "تمام|طيب|جميل|ممتاز",
    "how (?:are|r) (?:you|u)(?: doing| today)?",
    "how(?:'s| is) it going",
    "what'?s up|sup",
    "(?:i'?m )?(?:fine|good|great|ok|okay)(?: thanks)?",
    "nasılsın(?:ız)?|iyiyim",
    "(?:comment )?ça va|comment (?:vas[- ]tu|allez[- ]vous)",
    "apa kabar(?:mu)?",
    "(?:آپ|تم) کیسے (?:ہیں|ہو)|کیا حال ہے",
    "حالت چطوره|خوبی",
    "как дела",
  ),
];

/** نداء أو لاحقة لا تغيّر المعنى: «يا مستفتي»، "Mustafti"، "bro". */
const VOCATIVE = "(?:يا )?(?:مستفتي|اخي|اختي|شيخ|صديقي)|mustafti|bro|brother|sister|friend|dear|kardeşim|hocam|ami|abang|kak";

const COMPILED = PHRASES.map((p) => ({ kind: p.kind, re: new RegExp(`^(?:${foldLetters(p.re)})(?=\\s|$)\\s*`, "u") }));
const VOC_RE = new RegExp(`^(?:${foldLetters(VOCATIVE)})(?=\\s|$)\\s*`, "u");

/** أولوية النوع حين تجتمع عبارات: «مرحبا، من أنت؟» ← تعريف بالمنصة. */
const PRIORITY: SmallTalkKind[] = ["about_platform", "thanks", "farewell", "greeting", "small_talk"];

/**
 * نوع المحادثة العادية، أو null إن لم تكن الرسالة كلها عبارات محادثة (فتمضي في مسار السؤال).
 */
export function detectSmallTalk(text: string): SmallTalkKind | null {
  let rest = normalizeTalk(text);
  if (!rest || rest.length > MAX_CHARS) return null;
  const kinds = new Set<SmallTalkKind>();
  for (let guard = 0; rest && guard < 12; guard++) {
    const v = rest.match(VOC_RE);
    if (v && v[0]) {
      rest = rest.slice(v[0].length);
      continue;
    }
    // «و» للعطف بين العبارات: «شكراً وجزاك الله خيراً».
    if (/^و\s*/u.test(rest) && !/^وعليكم/u.test(rest) && !/^وداعا/u.test(rest)) {
      const after = rest.replace(/^و\s*/u, "");
      if (COMPILED.some((p) => p.re.test(after))) {
        rest = after;
        continue;
      }
    }
    const hit = COMPILED.find((p) => p.re.test(rest));
    if (!hit) return null;
    kinds.add(hit.kind);
    rest = rest.replace(hit.re, "");
  }
  if (rest) return null;
  return PRIORITY.find((k) => kinds.has(k)) ?? null;
}

// ---------------------------------------------------------------------------
// الردود الاحتياطية (إن تعذّر رد الشخصية) والأسئلة المقترحة
// ---------------------------------------------------------------------------

type Lang6 = "ar" | "en" | "tr" | "fr" | "ur" | "id";
const LANGS6: readonly Lang6[] = ["ar", "en", "tr", "fr", "ur", "id"];
const lang6 = (lang: string): Lang6 => {
  const b = (lang || "en").toLowerCase().split(/[-_]/)[0];
  return (LANGS6 as readonly string[]).includes(b) ? (b as Lang6) : b === "ms" ? "id" : b === "fa" ? "ur" : "en";
};

const OPENERS: Record<SmallTalkKind, Record<Lang6, string>> = {
  greeting: {
    ar: "وعليكم السلام ورحمة الله، أهلاً بك في مُستفتي.",
    en: "Wa alaikum assalam wa rahmatullah, welcome to Mustafti.",
    tr: "Ve aleyküm selam ve rahmetullah, Mustafti'ye hoş geldiniz.",
    fr: "Wa ʿalaykum as-salâm wa rahmatullah, bienvenue sur Mustafti.",
    ur: "وعلیکم السلام ورحمۃ اللہ، مستفتی میں خوش آمدید۔",
    id: "Wa'alaikumussalam warahmatullah, selamat datang di Mustafti.",
  },
  thanks: {
    ar: "وإياك، جزاك الله خيراً وبارك فيك.",
    en: "And you too — may Allah reward you with good and bless you.",
    tr: "Sizden de Allah razı olsun, hayırlarla mükâfatlandırsın.",
    fr: "Et vous de même, qu'Allah vous récompense par le bien et vous bénisse.",
    ur: "آپ کو بھی، اللہ آپ کو جزائے خیر دے اور برکت عطا فرمائے۔",
    id: "Sama-sama, semoga Allah membalas Anda dengan kebaikan dan memberkahi Anda.",
  },
  farewell: {
    ar: "في أمان الله وحفظه، أسعدني حديثك.",
    en: "May Allah keep you safe. It was a pleasure talking with you.",
    tr: "Allah'a emanet olun, sizinle konuşmak güzeldi.",
    fr: "Qu'Allah vous protège. Ce fut un plaisir d'échanger avec vous.",
    ur: "اللہ کی امان میں رہیں، آپ سے بات کر کے خوشی ہوئی۔",
    id: "Semoga Allah menjaga Anda. Senang berbincang dengan Anda.",
  },
  small_talk: {
    ar: "الحمد لله بخير، وأسأل الله أن تكون بخير وعافية.",
    en: "Alhamdulillah, all is well — I hope you are well too.",
    tr: "Elhamdülillah iyiyim, umarım siz de iyisinizdir.",
    fr: "Al-hamdu lillâh, tout va bien — j'espère que vous aussi.",
    ur: "الحمد للہ خیریت ہے، امید ہے آپ بھی خیریت سے ہوں گے۔",
    id: "Alhamdulillah baik, semoga Anda juga dalam keadaan baik.",
  },
  about_platform: {
    ar: "أنا مُستفتي، مساعد يجيب عن أسئلتك في دينك من مصادر إسلامية معتمدة، ويساعدك في إيصال مسألتك الشخصية إلى أهل العلم. لست مفتياً ولا أُصدر فتوى في حالتك.",
    en: "I am Mustafti, an assistant that answers your questions about your religion from approved Islamic sources and helps you bring your personal question to qualified scholars. I am not a mufti and I don't issue a fatwa on your case.",
    tr: "Ben Mustafti; dininizle ilgili sorularınızı onaylı İslami kaynaklardan cevaplayan ve kişisel meselenizi âlimlere ulaştırmanıza yardım eden bir asistanım. Müftü değilim, durumunuz hakkında fetva vermem.",
    fr: "Je suis Mustafti, un assistant qui répond à vos questions sur votre religion à partir de sources islamiques approuvées et vous aide à transmettre votre question personnelle aux savants. Je ne suis pas mufti et je ne délivre pas de fatwa sur votre cas.",
    ur: "میں مستفتی ہوں، ایک معاون جو آپ کے دینی سوالات کا جواب معتمد اسلامی مصادر سے دیتا ہے اور آپ کا ذاتی مسئلہ اہلِ علم تک پہنچانے میں مدد کرتا ہے۔ میں مفتی نہیں ہوں اور آپ کی حالت پر فتویٰ نہیں دیتا۔",
    id: "Saya Mustafti, asisten yang menjawab pertanyaan agama Anda dari sumber-sumber Islam yang diakui, dan membantu menyampaikan masalah pribadi Anda kepada para ulama. Saya bukan mufti dan tidak mengeluarkan fatwa atas kasus Anda.",
  },
};

const INVITE: Record<ChatMode, Record<Lang6, string>> = {
  general: {
    ar: "كيف أستطيع مساعدتك اليوم؟ يمكنك أن تسألني عن أي مسألة في دينك.",
    en: "How can I help you today? You can ask me about any matter of your religion.",
    tr: "Bugün size nasıl yardımcı olabilirim? Dininizle ilgili her meseleyi bana sorabilirsiniz.",
    fr: "Comment puis-je vous aider aujourd'hui ? Vous pouvez m'interroger sur toute question de votre religion.",
    ur: "آج میں آپ کی کیا مدد کر سکتا ہوں؟ آپ اپنے دین کے کسی بھی مسئلے کے بارے میں مجھ سے پوچھ سکتے ہیں۔",
    id: "Apa yang bisa saya bantu hari ini? Anda bisa bertanya kepada saya tentang masalah agama apa pun.",
  },
  new_muslim: {
    ar: "يسعدني أن أرافقك خطوة بخطوة في تعلّم دينك. عمّ تحب أن تسأل؟",
    en: "I'm glad to walk with you step by step as you learn your religion. What would you like to ask?",
    tr: "Dininizi öğrenirken size adım adım eşlik etmekten memnuniyet duyarım. Ne sormak istersiniz?",
    fr: "Je serai heureux de vous accompagner pas à pas dans l'apprentissage de votre religion. Que souhaitez-vous demander ?",
    ur: "دین سیکھنے میں قدم بہ قدم آپ کا ساتھ دے کر مجھے خوشی ہوگی۔ آپ کیا پوچھنا چاہیں گے؟",
    id: "Saya senang menemani Anda selangkah demi selangkah dalam mempelajari agama Anda. Apa yang ingin Anda tanyakan?",
  },
  discover: {
    ar: "يسعدني أن أجيب عن أي سؤال لديك عن الإسلام، بهدوء ووضوح. ماذا تحب أن تعرف؟",
    en: "I'm happy to answer any question you have about Islam, calmly and clearly. What would you like to know?",
    tr: "İslam hakkındaki her sorunuzu sakin ve açık bir şekilde cevaplamaktan memnuniyet duyarım. Ne öğrenmek istersiniz?",
    fr: "Je réponds volontiers à toutes vos questions sur l'islam, calmement et clairement. Que souhaitez-vous savoir ?",
    ur: "اسلام کے بارے میں آپ کے ہر سوال کا سکون اور وضاحت سے جواب دینے میں مجھے خوشی ہوگی۔ آپ کیا جاننا چاہیں گے؟",
    id: "Saya senang menjawab pertanyaan apa pun tentang Islam dengan tenang dan jelas. Apa yang ingin Anda ketahui?",
  },
};

const SUGGESTIONS: Record<ChatMode, Record<Lang6, [string, string, string]>> = {
  general: {
    ar: ["ما فضل صلاة الفجر في جماعة؟", "ما أذكار الصباح والمساء؟", "ما شروط صحة الصيام؟"],
    en: ["What is the virtue of praying Fajr in congregation?", "What are the morning and evening adhkar?", "What are the conditions of a valid fast?"],
    tr: ["Sabah namazını cemaatle kılmanın fazileti nedir?", "Sabah ve akşam zikirleri nelerdir?", "Orucun sahih olmasının şartları nelerdir?"],
    fr: ["Quel est le mérite de la prière de l'aube en groupe ?", "Quelles sont les invocations du matin et du soir ?", "Quelles sont les conditions de validité du jeûne ?"],
    ur: ["فجر کی نماز باجماعت پڑھنے کی فضیلت کیا ہے؟", "صبح و شام کے اذکار کون سے ہیں؟", "روزے کے صحیح ہونے کی شرائط کیا ہیں؟"],
    id: ["Apa keutamaan shalat Subuh berjamaah?", "Apa saja dzikir pagi dan petang?", "Apa syarat sah puasa?"],
  },
  new_muslim: {
    ar: ["كيف أصلي خطوة بخطوة؟", "كيف أتوضأ؟", "ما معنى الشهادتين؟"],
    en: ["How do I pray, step by step?", "How do I perform wudu?", "What do the two testimonies of faith mean?"],
    tr: ["Adım adım nasıl namaz kılarım?", "Nasıl abdest alırım?", "Kelime-i şehadetin anlamı nedir?"],
    fr: ["Comment prier, étape par étape ?", "Comment faire les ablutions ?", "Que signifient les deux attestations de foi ?"],
    ur: ["میں قدم بہ قدم نماز کیسے پڑھوں؟", "وضو کیسے کروں؟", "شہادتین کا مطلب کیا ہے؟"],
    id: ["Bagaimana cara shalat langkah demi langkah?", "Bagaimana cara berwudu?", "Apa makna dua kalimat syahadat?"],
  },
  discover: {
    ar: ["ما الإسلام باختصار؟", "من هو محمد ﷺ؟", "ماذا يقول الإسلام عن عيسى عليه السلام؟"],
    en: ["What is Islam, in short?", "Who is Muhammad ﷺ?", "What does Islam say about Jesus?"],
    tr: ["Kısaca İslam nedir?", "Hz. Muhammed ﷺ kimdir?", "İslam Hz. İsa hakkında ne der?"],
    fr: ["Qu'est-ce que l'islam, en bref ?", "Qui est Muhammad ﷺ ?", "Que dit l'islam de Jésus ?"],
    ur: ["مختصراً اسلام کیا ہے؟", "محمد ﷺ کون ہیں؟", "اسلام عیسیٰ علیہ السلام کے بارے میں کیا کہتا ہے؟"],
    id: ["Apa itu Islam secara singkat?", "Siapakah Muhammad ﷺ?", "Apa kata Islam tentang Isa (Yesus)?"],
  },
};

/** الرد الاحتياطي الثابت (بلا نموذج) بلغة السائل: افتتاح حسب النوع، ثم دعوة الشخصية إلى السؤال. */
export function smallTalkFallback(kind: SmallTalkKind, mode: ChatMode, lang: string): string {
  const l = lang6(lang);
  return kind === "farewell" ? OPENERS.farewell[l] : `${OPENERS[kind][l]} ${INVITE[mode][l]}`;
}

export function smallTalkSuggestions(mode: ChatMode, lang: string): string[] {
  return [...SUGGESTIONS[mode][lang6(lang)]];
}

/** تعليمات رد الشخصية على المحادثة العادية. */
export function smallTalkInstruction(kind: SmallTalkKind): string {
  const how: Record<SmallTalkKind, string> = {
    greeting: "The user greeted you. Return the greeting warmly (for «السلام عليكم» answer «وعليكم السلام ورحمة الله»), welcome them to Mustafti, and invite them to ask about any matter of their religion.",
    thanks: "The user thanked you. Reply warmly (in Arabic: «وإياك، جزاك الله خيراً»), and say you are glad to help with any other question.",
    farewell: "The user is saying goodbye. Bid them farewell warmly with a short supplication (e.g. «في أمان الله»).",
    small_talk: "The user is making small talk (e.g. asking how you are). Answer briefly and kindly (e.g. «الحمد لله بخير»), then invite them to ask their question.",
    about_platform:
      "The user asks who you are or what you can do. Introduce Mustafti briefly: an assistant that answers questions about Islam from approved Islamic sources and helps bring personal questions to qualified scholars; it does not issue a fatwa on anyone's personal case. Developed by Hamdi Bozkurt.",
  };
  return `CONVERSATION (not a question): ${how[kind]}
Rules: reply in the SAME language as the user's message, in 1–3 short sentences, warm and natural, in your persona's voice. No rulings, no evidence, no citations, no lists. Never mention any AI model, AI company or provider.
Also give exactly 3 short example questions (in the user's language) that fit your persona and that the user could ask you next.
Return JSON: {"reply": string, "suggestions": [string, string, string]}`;
}

/** رد الشخصية صالح؟ قصير، وبلا اسم نموذج أو مزوّد (وإلا فالرد الاحتياطي الثابت). */
const MODEL_OR_PROVIDER = /chat\s*gpt|\bgpt|openai|gemini|gemma|claude|anthropic|llama|\bmeta\s*ai|qwen|mistral|deepseek|grok|openrouter|google|جيميني|جيما|كلود|شات\s*جي\s*بي\s*تي/i;
export function validSmallTalkReply(reply: string): boolean {
  const r = reply.trim();
  return r.length > 0 && r.length <= 600 && !MODEL_OR_PROVIDER.test(r);
}
