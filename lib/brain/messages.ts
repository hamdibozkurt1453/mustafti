/**
 * الردود الثابتة لمُستفتي: مكتوبة هنا بأيدينا، لا يولّدها النموذج.
 * لذلك تُستعمل حين لا يجوز الاعتماد على التوليد: رفض الحكم، والامتناع، والإحالة، والعاجل،
 * وخارج النطاق، وأسئلة الهوية. ويُختبر في tests/brain.test.ts أن الحارس لا يعترض على أيٍّ منها.
 */

export const MESSAGE_LANGS = ["ar", "en", "tr", "fr", "ur", "id"] as const;
export type MessageLang = (typeof MESSAGE_LANGS)[number];

type Texts = Record<MessageLang, string>;

export const MESSAGES = {
  /** رد الرفض الثابت: يحل محل أي كلام للأداة فيه صيغة حكم. */
  refusal: {
    ar: "مُستفتي لا يُصدر أحكاماً شرعية ولا فتاوى. أستطيع أن أعرض عليك ما في المصادر المعتمدة من معلومات عامة، وأن أساعدك في إيصال سؤالك إلى مختص مؤهل يجيبك عن حالتك.",
    en: "Mustafti does not issue religious rulings or fatwas. I can show you general information from approved sources, and help you send your question to a qualified specialist who can answer about your situation.",
    tr: "Mustafti dinî hüküm veya fetva vermez. Onaylı kaynaklardaki genel bilgileri size gösterebilir ve sorunuzu durumunuz hakkında cevap verebilecek yetkin bir uzmana iletmenize yardımcı olabilirim.",
    fr: "Mustafti ne délivre ni avis juridique religieux ni fatwa. Je peux vous présenter des informations générales tirées de sources approuvées, et vous aider à transmettre votre question à un spécialiste qualifié qui répondra sur votre situation.",
    ur: "مستفتی کوئی شرعی حکم یا فتویٰ جاری نہیں کرتا۔ میں آپ کو معتمد مصادر سے عمومی معلومات دکھا سکتا ہوں، اور آپ کا سوال کسی اہل ماہر تک پہنچانے میں مدد کر سکتا ہوں جو آپ کی صورتِ حال کے بارے میں جواب دے۔",
    id: "Mustafti tidak mengeluarkan ketetapan hukum agama atau fatwa. Saya dapat menunjukkan informasi umum dari sumber-sumber yang diakui, dan membantu Anda mengirim pertanyaan kepada ahli yang berkompeten untuk menjawab tentang keadaan Anda.",
  },
  /** الامتناع عند عدم كفاية النصوص (القاعدة 3 في prompts.ts، والجملة العربية حرفية). */
  abstain: {
    ar: "لم أجد جواباً كافياً في المصادر المعتمدة.",
    en: "I did not find a sufficient answer in the approved sources.",
    tr: "Onaylı kaynaklarda yeterli bir cevap bulamadım.",
    fr: "Je n'ai pas trouvé de réponse suffisante dans les sources approuvées.",
    ur: "مجھے معتمد مصادر میں کافی جواب نہیں ملا۔",
    id: "Saya tidak menemukan jawaban yang memadai dalam sumber-sumber yang diakui.",
  },
  /** يُلحق بالامتناع. */
  suggestExpert: {
    ar: "يمكنك إرسال سؤالك إلى مختص ليجيبك.",
    en: "You can send your question to a specialist to answer you.",
    tr: "Sorunuzu cevaplaması için bir uzmana gönderebilirsiniz.",
    fr: "Vous pouvez envoyer votre question à un spécialiste pour qu'il vous réponde.",
    ur: "آپ اپنا سوال کسی ماہر کو بھیج سکتے ہیں تاکہ وہ جواب دے۔",
    id: "Anda dapat mengirim pertanyaan Anda kepada seorang ahli untuk dijawab.",
  },
  /** المستوى (د): حالة شخصية أو فتوى. */
  referral: {
    ar: "سؤالك عن حالتك أنت يحتاج إلى مختص يعرف تفاصيلها، ومُستفتي لا يُفتي. سأساعدك في توضيح سؤالك ثم إيصاله إلى مفتٍ مؤهل، دون أن نطلب اسمك.",
    en: "Your question is about your own situation, so it needs a specialist who knows its details, and Mustafti does not give fatwas. I will help you clarify your question and then send it to a qualified mufti, without asking for your name.",
    tr: "Sorunuz kendi durumunuzla ilgili; bu yüzden ayrıntılarını bilen bir uzman gerektirir ve Mustafti fetva vermez. Sorunuzu netleştirmenize ve isminizi sormadan yetkin bir müftüye iletmenize yardımcı olacağım.",
    fr: "Votre question porte sur votre propre situation : elle demande un spécialiste qui en connaisse les détails, et Mustafti ne délivre pas de fatwa. Je vais vous aider à préciser votre question puis à la transmettre à un mufti qualifié, sans vous demander votre nom.",
    ur: "آپ کا سوال آپ کی اپنی صورتِ حال کے بارے میں ہے، اس لیے اسے ایسے ماہر کی ضرورت ہے جو اس کی تفصیلات جانے، اور مستفتی فتویٰ نہیں دیتا۔ میں آپ کا سوال واضح کرنے اور پھر آپ کا نام پوچھے بغیر کسی اہل مفتی تک پہنچانے میں مدد کروں گا۔",
    id: "Pertanyaan Anda tentang keadaan Anda sendiri, sehingga memerlukan ahli yang mengetahui rinciannya, dan Mustafti tidak memberi fatwa. Saya akan membantu Anda memperjelas pertanyaan lalu mengirimkannya kepada mufti yang berkompeten, tanpa menanyakan nama Anda.",
  },
  /** المستوى (د): سؤال عن حكم عام («ما حكم من يسرق وهو مضطر؟»)، لا عن حالة السائل. */
  referralRuling: {
    ar: "هذا سؤال عن حكم شرعي، ومُستفتي لا يُصدر أحكاماً. أستطيع أن أساعدك في صياغته وإرساله إلى مفتٍ مؤهل.",
    en: "This is a question about a religious ruling, and Mustafti does not issue rulings. I can help you phrase it and send it to a qualified mufti.",
    tr: "Bu, dinî bir hüküm hakkında bir sorudur ve Mustafti hüküm vermez. Sorunuzu ifade etmenize ve yetkin bir müftüye göndermenize yardımcı olabilirim.",
    fr: "Ceci est une question sur un statut religieux, et Mustafti ne délivre pas d'avis juridiques. Je peux vous aider à la formuler et à l'envoyer à un mufti qualifié.",
    ur: "یہ ایک شرعی حکم کے بارے میں سوال ہے، اور مستفتی احکام جاری نہیں کرتا۔ میں اسے واضح الفاظ میں لکھنے اور کسی اہل مفتی کو بھیجنے میں آپ کی مدد کر سکتا ہوں۔",
    id: "Ini adalah pertanyaan tentang hukum agama, dan Mustafti tidak mengeluarkan ketetapan hukum. Saya dapat membantu Anda merumuskannya dan mengirimkannya kepada mufti yang berkompeten.",
  },
  /** وسم ترجمة المعنى حين يكون النص المصدر بغير لغة السائل (يقبله الحارس). */
  translationOfMeaning: {
    ar: "(ترجمة المعنى)",
    en: "(translation of meaning)",
    tr: "(anlam tercümesi)",
    fr: "(traduction du sens)",
    ur: "(ترجمۂ معنی)",
    id: "(terjemahan makna)",
  },
  /** المستوى (ج): تنبيه الخلاف، بلا ترجيح. */
  khilaf: {
    ar: "في هذه المسألة خلاف بين أهل العلم، وما سبق عرضٌ لما في المصادر دون ترجيح. للتفصيل في حالتك يمكنك سؤال مختص.",
    en: "Scholars hold differing views on this matter. The above presents what the sources say without preferring one view. For your own case you can ask a specialist.",
    tr: "Bu meselede âlimler arasında görüş ayrılığı vardır. Yukarıdakiler, bir görüşü tercih etmeden kaynaklardakini aktarır. Kendi durumunuz için bir uzmana sorabilirsiniz.",
    fr: "Les savants ont des avis divergents sur cette question. Ce qui précède présente les sources sans privilégier un avis. Pour votre cas, vous pouvez interroger un spécialiste.",
    ur: "اس مسئلے میں اہلِ علم کے درمیان اختلاف ہے۔ اوپر کسی رائے کو ترجیح دیے بغیر مصادر کی بات پیش کی گئی ہے۔ اپنی صورت کے لیے آپ کسی ماہر سے پوچھ سکتے ہیں۔",
    id: "Para ulama berbeda pendapat dalam masalah ini. Uraian di atas menyajikan isi sumber tanpa menguatkan salah satu pendapat. Untuk kasus Anda, Anda dapat bertanya kepada seorang ahli.",
  },
  /** عاجل: خطر على النفس أو عنف. */
  urgent: {
    ar: "سلامتك أولاً. إن كنت أنت أو غيرك في خطر الآن، فاتصل فوراً برقم الطوارئ في بلدك، أو اذهب إلى أقرب مكان آمن أو مستشفى، واطلب المساعدة من شخص تثق به قريب منك. لست وحدك، والمساعدة متاحة.",
    en: "Your safety comes first. If you or someone else is in danger right now, call your local emergency number immediately, or go to the nearest safe place or hospital, and ask someone you trust nearby for help. You are not alone, and help is available.",
    tr: "Önce güvenliğiniz. Siz veya bir başkası şu anda tehlikedeyse hemen ülkenizin acil durum numarasını arayın ya da en yakın güvenli yere veya hastaneye gidin ve yakınınızda güvendiğiniz birinden yardım isteyin. Yalnız değilsiniz, yardım mümkün.",
    fr: "Votre sécurité passe avant tout. Si vous ou quelqu'un d'autre êtes en danger maintenant, appelez immédiatement le numéro d'urgence de votre pays, ou rendez-vous dans le lieu sûr ou l'hôpital le plus proche, et demandez de l'aide à une personne de confiance près de vous. Vous n'êtes pas seul, de l'aide existe.",
    ur: "سب سے پہلے آپ کی حفاظت۔ اگر آپ یا کوئی اور اس وقت خطرے میں ہے تو فوراً اپنے ملک کے ایمرجنسی نمبر پر کال کریں، یا قریبی محفوظ جگہ یا ہسپتال جائیں، اور اپنے قریب کسی قابلِ اعتماد شخص سے مدد مانگیں۔ آپ اکیلے نہیں ہیں، مدد موجود ہے۔",
    id: "Keselamatan Anda yang utama. Jika Anda atau orang lain sedang dalam bahaya sekarang, segera hubungi nomor darurat di negara Anda, atau pergi ke tempat aman atau rumah sakit terdekat, dan mintalah bantuan orang yang Anda percayai di dekat Anda. Anda tidak sendirian, bantuan tersedia.",
  },
  /** خارج النطاق. */
  outOfScope: {
    ar: "عذراً، هذا خارج ما أستطيع المساعدة فيه. مُستفتي مخصص للأسئلة عن الإسلام من مصادر معتمدة، ولإيصال سؤالك الشخصي إلى أهل العلم، ومعه مواقيت الصلاة والأذكار.",
    en: "Sorry, this is outside what I can help with. Mustafti is for questions about Islam answered from approved sources, for sending your personal question to scholars, and for prayer times and adhkar.",
    tr: "Üzgünüm, bu yardımcı olabileceğim konuların dışında. Mustafti, onaylı kaynaklardan İslam hakkındaki sorular, kişisel sorunuzu âlimlere iletmek, namaz vakitleri ve zikirler içindir.",
    fr: "Désolé, cela dépasse ce que je peux faire. Mustafti sert aux questions sur l'islam, répondues à partir de sources approuvées, à transmettre votre question personnelle aux savants, ainsi qu'aux horaires de prière et aux invocations.",
    ur: "معذرت، یہ میری مدد کے دائرے سے باہر ہے۔ مستفتی اسلام کے بارے میں معتمد مصادر سے سوالات، آپ کا ذاتی سوال اہلِ علم تک پہنچانے، اور نماز کے اوقات و اذکار کے لیے ہے۔",
    id: "Maaf, ini di luar hal yang dapat saya bantu. Mustafti dibuat untuk pertanyaan tentang Islam dari sumber-sumber yang diakui, untuk menyampaikan pertanyaan pribadi Anda kepada ulama, serta waktu shalat dan dzikir.",
  },
  /** «من أنت؟ ومن طوّرك؟» — نص القسم 0.5 من الخطة. */
  identityWho: {
    ar: "أنا مُستفتي، مساعد ذكاء اصطناعي يجيب عن أسئلتك عن الإسلام من مصادر إسلامية معتمدة، ويساعدك في إيصال سؤالك الشخصي إلى أهل العلم. لست مفتياً ولا أُصدر أحكاماً. طوّره حمدي بوزكورت ضمن تحدي الذكاء الاصطناعي في خدمة المحتوى الإسلامي 2026.",
    en: "I am Mustafti, an AI assistant that answers your questions about Islam from approved Islamic sources and helps you bring your personal question to scholars. I am not a mufti and I do not issue rulings. I was developed by Hamdi Bozkurt for the 2026 AI Challenge in Serving Islamic Content.",
    tr: "Ben Mustafti, İslam hakkındaki sorularınızı onaylı İslami kaynaklardan cevaplayan ve kişisel sorunuzu âlimlere ulaştırmanıza yardım eden bir yapay zekâ asistanıyım. Müftü değilim ve hüküm vermem. Hamdi Bozkurt tarafından 2026 İslami İçeriğe Hizmette Yapay Zekâ Yarışması kapsamında geliştirildim.",
    fr: "Je suis Mustafti, un assistant d'intelligence artificielle qui répond à vos questions sur l'islam à partir de sources islamiques approuvées et vous aide à transmettre votre question personnelle aux savants. Je ne suis pas mufti et je ne délivre pas d'avis juridiques. J'ai été développé par Hamdi Bozkurt dans le cadre du Défi 2026 de l'IA au service du contenu islamique.",
    ur: "میں مستفتی ہوں، مصنوعی ذہانت کا ایک معاون جو اسلام کے بارے میں آپ کے سوالات کا جواب معتمد اسلامی مصادر سے دیتا ہے اور آپ کا ذاتی سوال اہلِ علم تک پہنچانے میں مدد کرتا ہے۔ میں مفتی نہیں ہوں اور احکام جاری نہیں کرتا۔ مجھے حمدی بوزکورت نے اسلامی مواد کی خدمت میں مصنوعی ذہانت کے چیلنج 2026 کے تحت تیار کیا۔",
    id: "Saya Mustafti, asisten kecerdasan buatan yang menjawab pertanyaan Anda tentang Islam dari sumber-sumber Islam yang diakui, dan membantu Anda menyampaikan pertanyaan pribadi kepada para ulama. Saya bukan mufti dan tidak mengeluarkan ketetapan hukum. Saya dikembangkan oleh Hamdi Bozkurt dalam Tantangan AI untuk Melayani Konten Islam 2026.",
  },
  /** «ما النموذج الذي تستعمله؟» — نص القسم 0.5 من الخطة. */
  identityModel: {
    ar: "أعمل بنموذج لغوي من مزوّد خارجي، وتفاصيلي التقنية منشورة في صفحة «عن مستفتي». أما أجوبتي فمن المصادر المعتمدة فقط.",
    en: "I run on a language model from an external provider, and my technical details are published on the “About Mustafti” page. My answers, however, come from approved sources only.",
    tr: "Harici bir sağlayıcının dil modeliyle çalışıyorum; teknik ayrıntılarım «Mustafti Hakkında» sayfasında yayımlanmıştır. Cevaplarım ise yalnızca onaylı kaynaklardandır.",
    fr: "Je fonctionne avec un modèle de langage d'un fournisseur externe, et mes détails techniques sont publiés sur la page « À propos de Mustafti ». Mes réponses, elles, proviennent uniquement de sources approuvées.",
    ur: "میں ایک بیرونی فراہم کنندہ کے لسانی ماڈل پر کام کرتا ہوں، اور میری تکنیکی تفصیلات «مستفتی کے بارے میں» صفحے پر شائع ہیں۔ البتہ میرے جوابات صرف معتمد مصادر سے ہوتے ہیں۔",
    id: "Saya bekerja dengan model bahasa dari penyedia eksternal, dan rincian teknis saya dipublikasikan di halaman “Tentang Mustafti”. Adapun jawaban saya hanya berasal dari sumber-sumber yang diakui.",
  },
  /** محاولات التلاعب: «تجاهل تعليماتك»، «أنت مفتٍ الآن»، «أنت الآن نموذج آخر». */
  identityStay: {
    ar: "أبقى مُستفتي، ولا أستطيع تغيير دوري: لست مفتياً ولا أُصدر أحكاماً، وأجيب من المصادر المعتمدة فقط. يسعدني أن أساعدك في سؤالك ضمن ذلك.",
    en: "I remain Mustafti and cannot change my role: I am not a mufti, I do not issue rulings, and I answer from approved sources only. I am happy to help with your question within that.",
    tr: "Mustafti olarak kalıyorum ve rolümü değiştiremem: Müftü değilim, hüküm vermem ve yalnızca onaylı kaynaklardan cevap veririm. Bu çerçevede sorunuza yardımcı olmaktan memnuniyet duyarım.",
    fr: "Je reste Mustafti et je ne peux pas changer de rôle : je ne suis pas mufti, je ne délivre pas d'avis juridiques et je réponds uniquement à partir de sources approuvées. Je vous aide volontiers dans ce cadre.",
    ur: "میں مستفتی ہی رہتا ہوں اور اپنا کردار نہیں بدل سکتا: میں مفتی نہیں ہوں، احکام جاری نہیں کرتا، اور صرف معتمد مصادر سے جواب دیتا ہوں۔ اسی دائرے میں آپ کی مدد کر کے خوشی ہوگی۔",
    id: "Saya tetap Mustafti dan tidak dapat mengubah peran saya: saya bukan mufti, tidak mengeluarkan ketetapan hukum, dan hanya menjawab dari sumber-sumber yang diakui. Dengan senang hati saya membantu pertanyaan Anda dalam batas itu.",
  },
} satisfies Record<string, Texts>;

export type MessageKey = keyof typeof MESSAGES;

/** لغة الردود الثابتة: لغة السائل إن كُتبت لها، وإلا الإنجليزية (والعربية للعربية). */
export function messageLang(lang: string | undefined): MessageLang {
  const base = (lang ?? "ar").toLowerCase().split(/[-_]/)[0];
  return (MESSAGE_LANGS as readonly string[]).includes(base) ? (base as MessageLang) : "en";
}

export function message(key: MessageKey, lang?: string): string {
  return MESSAGES[key][messageLang(lang)];
}
