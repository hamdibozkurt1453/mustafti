import { matchKey } from "./guard";

/**
 * قوائم العناصر الواجبة للأسئلة العملية (R5b): الصلاة، والوضوء، والغسل، والصيام، والشهادتان.
 *
 * حين يطابق السؤال موضوعاً منها (في المحادثة العامة و«المرشد»):
 *   1) تُشغَّل بحوث فرعية موجّهة بالتوازي لكل عنصر (حديث MCP بعبارة الذكر، ومكتبة IslamHouse،
 *      و«الإسلام سؤال وجواب» المحلي، و«الأساسيات») — retrieval.ts: checklistCandidates.
 *   2) لا يُقبل نص لعنصر إلا إن وُجد فيه دليله بالكود (evidence)، فلا يُنسب ذكر إلى نص لا يحويه.
 *   3) تُمرَّر للنموذج «العناصر المطلوب تغطيتها» بأقسامها ومعها أرقام النصوص التي فيها كل عنصر
 *      (checklistBlock). R5c: القائمة **تذكير** ليكمل النموذج الجواب، لا بوابة حذف: العنصر بلا نص
 *      يُكتب من علم المساعد بلا رقم مصدر، ولا يُحذف من الجواب شيء لغياب نصه.
 *   4) «الاكتمال» = نسبة العناصر المذكورة في الجواب (markers)، في التشخيص وصفحة الفحص.
 *
 * الملف مراجع فقط، لا نص ديني يصل إلى السائل: عبارات البحث وكلمات التحقق تُطابَق بها نصوص المصادر.
 * ملف نقي: يُختبر بلا شبكة.
 */

export type ChecklistId = "salah" | "wudu" | "ghusl" | "siyam" | "shahada";

export type ChecklistItem = {
  id: string;
  /** القسم الذي ينتمي إليه (sections). */
  section: string;
  ar: string;
  en: string;
  /** فيه ذكر يُقال: «ماذا تقول» بالعربية بين «» من المصدر (وبالنطق والمعنى لغير العربي). */
  say?: boolean;
  /** عبارات بحث الحديث (MCP) لهذا العنصر. */
  hadith?: string[];
  /**
   * دليل العنصر في نص المصدر (بعد matchKey): يكفي واحد منها. ما لا يحوي دليله لا يُنسب إليه العنصر،
   * ونتيجة البحث الفرعي التي لا تحويه تسقط.
   */
  evidence: string[];
  /** علامات ذكر العنصر في الجواب (بعد matchKey، بلغات الواجهة الشائعة والنطق اللاتيني). */
  markers: string[];
};

export type Checklist = {
  id: ChecklistId;
  topic_ar: string;
  topic_en: string;
  match: RegExp[];
  sections: { id: string; ar: string; en: string }[];
  items: ChecklistItem[];
  /** عبارات «الإسلام سؤال وجواب» المحلي ومكتبة IslamHouse التعليمية. */
  islamqa: string[];
  library: string[];
};

const SALAH: Checklist = {
  id: "salah",
  topic_ar: "صفة الصلاة",
  topic_en: "How to pray",
  match: [
    /كيف\s+(?:[أا]|ن)?صل[يى]|كيفي[ةه]\s+(?:أداء\s+)?الصلا[ةه]|صف[ةه]\s+الصلا[ةه]|طريق[ةه]\s+الصلا[ةه]|خطوات\s+الصلا[ةه]|تعلم\s+الصلا[ةه]|أتعلم\s+الصلا[ةه]/u,
    /\bhow\s+(?:do\s+i\s+|to\s+|should\s+i\s+|can\s+i\s+|do\s+(?:muslims|you)\s+)?(?:pray|perform\s+(?:the\s+)?(?:prayer|salah|salat))\b|\bsteps?\s+of\s+(?:the\s+)?(?:prayer|salah|salat)\b/i,
    /namaz\s+nas[ıi]l\s+k[ıi]l[ıi]n[ıi]r|nas[ıi]l\s+namaz\s+k[ıi]l/iu,
    /comment\s+(?:faire\s+la\s+)?pri(?:er|ère)|comment\s+accomplir\s+la\s+pri[eè]re/iu,
    /\bcara\s+(?:shalat|salat|sholat)\b|tata\s+cara\s+(?:shalat|salat|sholat)/i,
    /نماز\s+(?:کا\s+طریقہ|کیسے\s+پڑھ)/u,
  ],
  sections: [
    { id: "before", ar: "قبل الصلاة", en: "Before the prayer" },
    { id: "rakah1", ar: "الركعة الأولى", en: "The first rak'ah" },
    { id: "rest", ar: "بقية الركعات", en: "The remaining rak'ahs" },
    { id: "end", ar: "التشهد والختام", en: "Tashahhud and ending" },
  ],
  items: [
    { id: "taharah", section: "before", ar: "الطهارة (الوضوء)", en: "Purification (wudu)", evidence: ["يتوضا", "توضا", "طهور", "الوضوء"], markers: ["وضو", "توضا", "يتوضا", "طهار", "wudu", "wudhu", "ablution", "abdest", "purif"] },
    { id: "qibla", section: "before", ar: "استقبال القبلة والنية", en: "Facing the qibla and intention", evidence: ["القبله", "استقبل", "شطر المسجد الحرام", "بالنيات"], markers: ["قبله", "نيه", "qibla", "kible", "intention", "niyyah", "niyet", "kiblat"] },
    { id: "takbir", section: "rakah1", ar: "تكبيرة الإحرام", en: "Opening takbir", say: true, hadith: ["تحريمها التكبير وتحليلها التسليم"], evidence: ["تحريمها التكبير", "فكبر", "الله اكبر", "اذا قمت الي الصلاه فكبر"], markers: ["تكبير", "كبر", "الله اكبر", "allahu akbar", "takbir", "tekbir"] },
    { id: "istiftah", section: "rakah1", ar: "دعاء الاستفتاح", en: "Opening supplication", say: true, hadith: ["سبحانك اللهم وبحمدك وتبارك اسمك"], evidence: ["سبحانك اللهم وبحمدك", "اللهم باعد بيني وبين خطاياي"], markers: ["استفتاح", "سبحانك اللهم", "subhanaka", "opening supplication", "sübhaneke", "istiftah"] },
    { id: "fatiha", section: "rakah1", ar: "قراءة الفاتحة", en: "Reciting al-Fatihah", say: true, hadith: ["لا صلاة لمن لم يقرأ بفاتحة الكتاب"], evidence: ["بفاتحه الكتاب", "ام القران", "الفاتحه"], markers: ["فاتحه", "fatiha", "fatihah", "fâtiha", "fatihah"] },
    { id: "ruku", section: "rakah1", ar: "الركوع وذكره", en: "Bowing (ruku') and its dhikr", say: true, hadith: ["سبحان ربي العظيم"], evidence: ["سبحان ربي العظيم"], markers: ["ركوع", "اركع", "ركع", "سبحان ربي العظيم", "ruku", "rüku", "rukuk", "bow", "subhana rabbiyal"] },
    { id: "rafa", section: "rakah1", ar: "الرفع من الركوع وذكره", en: "Rising from bowing and its dhikr", say: true, hadith: ["سمع الله لمن حمده ربنا ولك الحمد"], evidence: ["سمع الله لمن حمده", "ربنا ولك الحمد", "ربنا لك الحمد"], markers: ["سمع الله لمن حمده", "ربنا ولك الحمد", "ربنا لك الحمد", "sami allahu", "samiallahu", "rabbana"] },
    { id: "sujud", section: "rakah1", ar: "السجود وذكره", en: "Prostration (sujud) and its dhikr", say: true, hadith: ["سبحان ربي الأعلى"], evidence: ["سبحان ربي الاعلي"], markers: ["سجود", "اسجد", "سجد", "سبحان ربي الاعلي", "sujud", "secde", "sujood", "prostrat", "sujud"] },
    { id: "jalsa", section: "rakah1", ar: "الجلسة بين السجدتين وذكرها", en: "Sitting between the two prostrations", say: true, hadith: ["كان يقول بين السجدتين رب اغفر لي"], evidence: ["بين السجدتين"], markers: ["بين السجدتين", "رب اغفر لي", "rabbighfirli", "rabbi ghfir", "between the two prostrations", "iki secde arası"] },
    { id: "rakah2", section: "rest", ar: "الركعة الثانية وما بعدها مثل الأولى", en: "The second rak'ah and after, like the first", evidence: ["الركعه الثانيه", "في صلاتك كلها", "ثم افعل ذلك"], markers: ["ركعه الثانيه", "الثانيه", "second rak", "ikinci rekat", "next rak", "deuxième"] },
    { id: "tashahhud", section: "end", ar: "التشهد", en: "Tashahhud", say: true, hadith: ["التحيات لله والصلوات والطيبات"], evidence: ["التحيات لله"], markers: ["تشهد", "التحيات", "tashahhud", "tahiyyat", "attahiyyat", "teşehhüd", "ettehiyyatu"] },
    { id: "salawat", section: "end", ar: "الصلاة على النبي ﷺ (الإبراهيمية)", en: "Sending blessings on the Prophet ﷺ", say: true, hadith: ["اللهم صل على محمد وعلى آل محمد كما صليت على إبراهيم"], evidence: ["اللهم صل علي محمد", "كما صليت علي ابراهيم"], markers: ["صل علي محمد", "ابراهيميه", "salawat", "ibrahimiyya", "allahumma salli", "salli"] },
    { id: "taslim", section: "end", ar: "التسليم", en: "Ending with taslim", say: true, hadith: ["السلام عليكم ورحمة الله عن يمينه وعن شماله"], evidence: ["السلام عليكم ورحمه الله", "وتحليلها التسليم"], markers: ["تسليم", "السلام عليكم", "taslim", "selam", "salam", "assalamu"] },
    { id: "rakat", section: "end", ar: "عدد ركعات الصلوات الخمس", en: "Number of rak'ahs of the five prayers", hadith: ["فرضت الصلاة ركعتين ركعتين"], evidence: ["ركعتين", "اربع ركعات", "ثلاث ركعات", "عدد الركعات", "عدد ركعات"], markers: ["ركعات", "ركعتان", "ركعتين", "rakat", "rak'at", "rakah", "rak'ah", "rekat", "raka"] },
  ],
  islamqa: ["صفة الصلاة", "عدد ركعات الصلوات الخمس"],
  library: ["صفة الصلاة"],
};

const WUDU: Checklist = {
  id: "wudu",
  topic_ar: "صفة الوضوء",
  topic_en: "How to make wudu",
  match: [
    /كيف\s+(?:[أا])?توض[أا]|صف[ةه]\s+الوضوء|كيفي[ةه]\s+الوضوء|طريق[ةه]\s+الوضوء|خطوات\s+الوضوء|تعلم\s+الوضوء/u,
    /\bhow\s+(?:do\s+i\s+|to\s+|should\s+i\s+|can\s+i\s+)?(?:make|perform|do|take)\s+(?:the\s+)?(?:wudu|wudhu|wudoo|ablution)|\bsteps?\s+of\s+(?:wudu|wudhu|ablution)\b/i,
    /abdest\s+nas[ıi]l\s+al[ıi]n[ıi]r|nas[ıi]l\s+abdest\s+al/iu,
    /comment\s+faire\s+(?:les|ses|mes)\s+ablutions/iu,
    /\bcara\s+(?:berwudhu|wudhu|wudu)\b/i,
    /وضو\s+(?:کا\s+طریقہ|کیسے)/u,
  ],
  sections: [
    { id: "start", ar: "البداية", en: "Beginning" },
    { id: "wash", ar: "أعضاء الوضوء بالترتيب", en: "The steps in order" },
    { id: "end", ar: "بعد الوضوء", en: "After wudu" },
  ],
  items: [
    { id: "niyyah", section: "start", ar: "النية", en: "Intention", evidence: ["بالنيات", "النيه"], markers: ["نيه", "انو", "intention", "niyyah", "niyet", "niat"] },
    { id: "tasmiya", section: "start", ar: "التسمية «بسم الله»", en: "Saying Bismillah", say: true, hadith: ["لا وضوء لمن لم يذكر اسم الله عليه"], evidence: ["اسم الله عليه", "بسم الله"], markers: ["بسم الله", "تسميه", "bismillah", "besmele"] },
    { id: "hands", section: "wash", ar: "غسل الكفين", en: "Washing the hands", hadith: ["فأفرغ على كفيه ثلاث مرار فغسلهما"], evidence: ["كفيه", "يديه"], markers: ["كفين", "كفيك", "hands", "eller", "mains", "tangan"] },
    { id: "mouth_nose", section: "wash", ar: "المضمضة والاستنشاق", en: "Rinsing the mouth and nose", hadith: ["ثم مضمض واستنشق واستنثر"], evidence: ["مضمض", "استنشق", "استنثر"], markers: ["مضمض", "استنشاق", "استنشق", "mouth", "nose", "ağız", "burun", "bouche", "hidung"] },
    { id: "face", section: "wash", ar: "غسل الوجه", en: "Washing the face", evidence: ["وجهه", "وجوهكم"], markers: ["الوجه", "وجهك", "face", "yüz", "visage", "wajah"] },
    { id: "arms", section: "wash", ar: "غسل اليدين إلى المرفقين", en: "Washing the arms to the elbows", evidence: ["المرفقين", "المرافق", "المرفق"], markers: ["مرفق", "elbow", "dirsek", "coude", "siku"] },
    { id: "head", section: "wash", ar: "مسح الرأس", en: "Wiping the head", evidence: ["مسح براسه", "وامسحوا برءوسكم", "وامسحوا بروسكم", "مسح راسه"], markers: ["مسح", "راس", "head", "baş", "tête", "kepala"] },
    { id: "ears", section: "wash", ar: "مسح الأذنين", en: "Wiping the ears", evidence: ["اذنيه", "الاذنين"], markers: ["اذن", "ears", "kulak", "oreilles", "telinga"] },
    { id: "feet", section: "wash", ar: "غسل الرجلين إلى الكعبين", en: "Washing the feet to the ankles", evidence: ["الكعبين", "رجليه", "وارجلكم"], markers: ["رجل", "كعب", "feet", "foot", "ankle", "ayak", "pieds", "kaki"] },
    { id: "dua", section: "end", ar: "الذكر بعد الوضوء", en: "The supplication after wudu", say: true, hadith: ["ثم يقول أشهد أن لا إله إلا الله وحده لا شريك له وأشهد أن محمدا عبده ورسوله"], evidence: ["اشهد ان لا اله الا الله وحده لا شريك له"], markers: ["اشهد ان لا اله الا الله", "ashhadu", "eşhedü", "shahada", "testimony", "syahadat"] },
  ],
  islamqa: ["صفة الوضوء"],
  library: ["صفة الوضوء"],
};

const GHUSL: Checklist = {
  id: "ghusl",
  topic_ar: "صفة الغسل",
  topic_en: "How to make ghusl",
  match: [
    /كيف\s+(?:[أا])?غتسل|صف[ةه]\s+الغسل|كيفي[ةه]\s+الغسل|طريق[ةه]\s+الغسل|غسل\s+الجناب[ةه]\s+كيف/u,
    /\bhow\s+(?:do\s+i\s+|to\s+|should\s+i\s+)?(?:make|perform|do|take)\s+(?:a\s+|the\s+)?ghusl\b|\bsteps?\s+of\s+ghusl\b/i,
    /gus[uü]l\s+abdesti\s+nas[ıi]l/iu,
    /\bcara\s+mandi\s+(?:wajib|junub|besar)\b/i,
  ],
  sections: [{ id: "steps", ar: "خطوات الغسل", en: "The steps of ghusl" }],
  items: [
    { id: "niyyah", section: "steps", ar: "النية", en: "Intention", evidence: ["بالنيات", "النيه"], markers: ["نيه", "intention", "niyyah", "niyet", "niat"] },
    { id: "hands", section: "steps", ar: "غسل اليدين", en: "Washing the hands", hadith: ["كان إذا اغتسل من الجنابة بدأ فغسل يديه"], evidence: ["فغسل يديه", "غسل يديه", "كفيه"], markers: ["يدين", "يديك", "hands", "eller", "tangan"] },
    { id: "private", section: "steps", ar: "غسل الفرج", en: "Washing the private parts", evidence: ["فرجه", "مذاكيره"], markers: ["فرج", "عوره", "private", "avret", "kemaluan"] },
    { id: "wudu", section: "steps", ar: "الوضوء", en: "Making wudu", evidence: ["توضا وضوءه للصلاه", "وضوءه للصلاه"], markers: ["وضو", "توضا", "يتوضا", "wudu", "ablution", "abdest"] },
    { id: "head", section: "steps", ar: "إفاضة الماء على الرأس", en: "Pouring water over the head", evidence: ["علي راسه", "شعره", "ثلاث حثيات"], markers: ["راس", "شعر", "head", "hair", "baş", "kepala"] },
    { id: "body", section: "steps", ar: "تعميم الجسد بالماء", en: "Washing the whole body", evidence: ["سائر جسده", "جلده كله", "علي جلده"], markers: ["جسد", "جسم", "body", "vücut", "badan", "tubuh"] },
  ],
  islamqa: ["صفة الغسل من الجنابة"],
  library: ["صفة الغسل"],
};

const SIYAM: Checklist = {
  id: "siyam",
  topic_ar: "كيفية الصيام",
  topic_en: "How to fast",
  match: [
    /كيف\s+(?:[أا])?صوم|كيفي[ةه]\s+الصيام|كيفي[ةه]\s+الصوم|صف[ةه]\s+الصيام|كيف\s+يصوم\s+المسلم/u,
    /\bhow\s+(?:do\s+i\s+|to\s+|should\s+i\s+|do\s+muslims\s+)?fast\b/i,
    /oru[çc]\s+nas[ıi]l\s+tutulur|nas[ıi]l\s+oru[çc]\s+tut/iu,
    /comment\s+je[uû]ner/iu,
    /\bcara\s+(?:berpuasa|puasa)\b/i,
  ],
  sections: [{ id: "day", ar: "يوم الصيام", en: "The fasting day" }],
  items: [
    { id: "niyyah", section: "day", ar: "النية من الليل", en: "Intention from the night before", hadith: ["من لم يبيت الصيام من الليل فلا صيام له"], evidence: ["يبيت الصيام", "بالنيات"], markers: ["نيه", "intention", "niyyah", "niyet", "niat"] },
    { id: "suhur", section: "day", ar: "السحور", en: "Suhur (pre-dawn meal)", hadith: ["تسحروا فإن في السحور بركة"], evidence: ["السحور", "تسحروا"], markers: ["سحور", "suhur", "sahur", "suhoor"] },
    { id: "times", section: "day", ar: "الإمساك من الفجر إلى المغرب", en: "From dawn to sunset", evidence: ["الخيط الابيض", "اتموا الصيام الي الليل", "الفجر"], markers: ["فجر", "مغرب", "غروب", "dawn", "sunset", "fajr", "maghrib", "imsak", "iftar"] },
    { id: "avoid", section: "day", ar: "ما يُمتنع عنه (الأكل والشرب والجماع)", en: "What to abstain from", evidence: ["كلوا واشربوا", "طعامه وشرابه وشهوته", "الرفث"], markers: ["اكل", "شرب", "eat", "drink", "yemek", "içmek", "makan", "minum"] },
    { id: "iftar", section: "day", ar: "تعجيل الفطر", en: "Breaking the fast promptly", hadith: ["لا يزال الناس بخير ما عجلوا الفطر"], evidence: ["عجلوا الفطر", "الفطر"], markers: ["فطر", "افطر", "iftar", "break the fast", "berbuka"] },
    { id: "exempt", section: "day", ar: "أصحاب الأعذار (المريض والمسافر)", en: "Who is excused (the sick and the traveller)", evidence: ["مريضا او علي سفر", "المسافر"], markers: ["مريض", "مسافر", "sick", "travel", "hasta", "yolcu", "sakit", "musafir"] },
  ],
  islamqa: ["كيفية الصيام", "مفطرات الصيام"],
  library: ["أحكام الصيام"],
};

const SHAHADA: Checklist = {
  id: "shahada",
  topic_ar: "الشهادتان",
  topic_en: "The two testimonies",
  match: [
    /الشهادت(?:ين|ان)|كيف\s+(?:[أا])?دخل\s+(?:في\s+)?الإسلام|كيف\s+(?:[أا])?سلم|كيف\s+(?:[أا])?نطق\s+الشهاد/u,
    /\bshahada(?:h)?\b|\bhow\s+(?:do\s+i\s+|to\s+|can\s+i\s+)?(?:become|convert\s+to)\s+(?:a\s+)?(?:muslim|islam)\b/i,
    /kelime-?i\s+şehadet|nas[ıi]l\s+m[uü]sl[uü]man\s+olunur/iu,
    /comment\s+devenir\s+musulman|\bchahada\b/iu,
    /\bsyahadat\b|cara\s+masuk\s+islam/i,
  ],
  sections: [{ id: "shahada", ar: "الشهادتان", en: "The two testimonies" }],
  items: [
    { id: "text", section: "shahada", ar: "نص الشهادتين", en: "The words of the testimony", say: true, hadith: ["بني الإسلام على خمس شهادة أن لا إله إلا الله وأن محمدا رسول الله"], evidence: ["شهاده ان لا اله الا الله وان محمدا رسول الله", "اشهد ان لا اله الا الله"], markers: ["لا اله الا الله", "محمد رسول الله", "محمدا رسول الله", "ashhadu", "la ilaha illa", "eşhedü"] },
    { id: "tawhid", section: "shahada", ar: "معنى لا إله إلا الله", en: "Meaning of «la ilaha illa Allah»", evidence: ["لا اله الا الله", "فاعلم انه"], markers: ["لا معبود", "لا يعبد", "no god", "none worthy", "tauhid", "tawhid", "ilah"] },
    { id: "risala", section: "shahada", ar: "معنى محمد رسول الله", en: "Meaning of «Muhammad is the Messenger of Allah»", evidence: ["محمد رسول الله", "محمدا رسول الله"], markers: ["رسول الله", "messenger", "rasul", "peygamber", "elçi", "utusan"] },
    { id: "sincerity", section: "shahada", ar: "قولها صدقاً من القلب", en: "Saying it sincerely from the heart", hadith: ["ما من أحد يشهد أن لا إله إلا الله وأن محمدا رسول الله صدقا من قلبه"], evidence: ["صدقا من قلبه", "مستيقنا", "خالصا من قلبه"], markers: ["صدق", "قلب", "يقين", "sincer", "heart", "kalp", "ikhlas", "hati"] },
  ],
  islamqa: ["معنى الشهادتين"],
  library: ["الشهادتان"],
};

export const CHECKLISTS: Checklist[] = [SALAH, WUDU, GHUSL, SIYAM, SHAHADA];

/** الموضوع العملي المطابق للسؤال، أو null. «شروط الصلاة» ليست «كيف أصلي». */
export function matchChecklist(question: string): Checklist | null {
  return CHECKLISTS.find((c) => c.match.some((re) => re.test(question))) ?? null;
}

/** هل في النص دليل العنصر؟ (بعد matchKey، فلا يضر التشكيل ولا اختلاف الهمزات). */
export function hasEvidence(item: ChecklistItem, text: string): boolean {
  const key = matchKey(text);
  return item.evidence.some((e) => key.includes(matchKey(e)));
}

export type ChecklistMapping = { item: ChecklistItem; passages: number[] }[];

/** لكل عنصر: أرقام النصوص (1…) التي فيها دليله. */
export function mapChecklist(list: Checklist, passages: { text: string }[]): ChecklistMapping {
  return list.items.map((item) => ({
    item,
    passages: passages.flatMap((p, i) => (hasEvidence(item, p.text) ? [i + 1] : [])),
  }));
}

export type ChecklistCoverage = { id: ChecklistId; covered: string[]; missing: string[]; ratio: number };

/** علامة في أول كلمة (مع سوابق العربية المتصلة و«ال»)، فلا تطابق «salam» داخل «islam». */
function markerRe(marker: string): RegExp {
  const key = matchKey(marker).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefix = /[\u0600-\u06FF]/.test(key) ? "(?:[وفبلك])?(?:ال)?" : "";
  return new RegExp(`(?:^|\\s)${prefix}${key}`, "u");
}

/** «الاكتمال»: نسبة عناصر القائمة المذكورة في الجواب (علامات العنصر بعد matchKey). */
export function checklistCoverage(list: Checklist, answer: string): ChecklistCoverage {
  const key = matchKey(answer);
  const covered: string[] = [];
  const missing: string[] = [];
  for (const item of list.items) {
    const found = item.markers.some((m) => markerRe(m).test(key));
    (found ? covered : missing).push(item.id);
  }
  return { id: list.id, covered, missing, ratio: list.items.length ? covered.length / list.items.length : 1 };
}

/**
 * «العناصر المطلوب تغطيتها» للنموذج (تذكير لا بوابة، R5c): الأقسام بالترتيب، وتحت كل قسم عناصره مع
 * أرقام نصوصها إن وُجدت، والعنصر بلا نص يُكتب من علم المساعد بلا رقم. ثم شكل «ماذا تفعل» و«ماذا تقول».
 */
export function checklistBlock(list: Checklist, mapping: ChecklistMapping, lang: string): string {
  const lines: string[] = [
    `ITEMS TO COVER — «${list.topic_ar}» (${list.topic_en}). This is a REMINDER so your answer is complete: a complete practical answer covers EVERY item below, in this order, under these short section headings (translate the headings into the asker's language: ${lang}). Write each item from your own knowledge; add the passage numbers where given:`,
  ];
  for (const section of list.sections) {
    const rows = mapping.filter((m) => m.item.section === section.id);
    if (!rows.length) continue;
    lines.push(`**${section.ar}** (${section.en})`);
    for (const { item, passages } of rows) {
      lines.push(
        passages.length
          ? `- ${item.en} (${item.ar}) — passages ${passages.map((n) => `[${n}]`).join("")}${item.say ? " — has words to say" : ""}`
          : `- ${item.en} (${item.ar})${item.say ? " — has words to say" : ""} — from your knowledge (no passage number)`,
      );
    }
  }
  lines.push(
    `For each step write two short lines: «ماذا تفعل» (what to do) and, when the step has words to say, «ماذا تقول» (what to say): the Arabic words inside «…», with [n] when a passage contains them.${
      lang === "ar" ? "" : " After the Arabic, give the Latin transliteration and then the meaning in the asker's language, both OUTSIDE quotation marks."
    } Give the number of repetitions of each dhikr and the number of rak'ahs where they apply. Begin with one reassuring sentence and end with one short encouraging sentence.`,
  );
  return lines.join("\n");
}
