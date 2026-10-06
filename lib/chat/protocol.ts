/**
 * بروتوكول بث المحادثة بين /api/chat والواجهة: سطر JSON لكل حدث (NDJSON).
 *
 *   stage  ← مرحلة العمل (لمؤشر «يبحث في المصادر…»).
 *   start  ← نوع الرد ولغته واتجاهه وبطاقات المصادر (قبل أول كلمة).
 *   delta  ← جزء من النص (كلمة أو كلمات)، بالترتيب.
 *   reset  ← R5: امسح ما كُتب (محاولة صياغة ثانية تبدأ).
 *   final  ← R5: الرد النهائي بعد التحقق الكامل (النص والمصادر وكل الحقول)، يحل محل ما بُث.
 *   done   ← اكتمل الرد.
 *   error  ← رسالة لطيفة ثابتة (بلا تفاصيل فنية ولا اسم نموذج).
 *
 * R5: الجواب يُبث أثناء كتابته جملةً جملة، وكل جملة تمر بالتحقق قبل إرسالها (lib/brain/respond.ts)،
 * ثم يأتي الجواب النهائي بعد التحقق الحرفي على الجواب كاملاً في حدث final. والردود الثابتة
 * والمخزّنة تُبث كما كانت (start ثم delta ثم done).
 */

export type ChatStage = "understanding" | "searching" | "reading" | "readingFatwa" | "verifying" | "writing";

/** chitchat (F2b): رد الشخصية على التحية والشكر والسؤال عن المنصة، مع أسئلة مقترحة. */
export type ChatReplyKind = "identity" | "urgent" | "out_of_scope" | "referral" | "answer" | "abstain" | "refused" | "chitchat";

/** بطاقة مصدر: نص منقول بحروفه من المصدر، ورقمه كما رآه النموذج ([n] في الشرح). */
export type ChatSource = {
  n: number;
  title: string;
  text: string;
  url: string;
  source: string;
  /** درجة الحديث كما ذكرها المصدر. */
  grade?: string;
  lang?: string;
  /** للآيات: نص الآية، ثم التفسير الميسر (tafsir) أو ترجمة المعنى (translation). */
  verse?: string;
  note?: string;
  noteKind?: "tafsir" | "translation";
  /** R5b: نوع البطاقة: حديث (يُطوى في «المرشد»)، أو مادة مكتبة (زر «فتح / تحميل»). */
  kind?: "hadith" | "library";
};

/** فتوى منشورة: العنوان، والمفتي أو الجهة، ومقتطف حرفي من الجواب (≤ 400 حرف)، والرابط. */
export type ChatFatwa = { title: string; mufti: string; excerpt: string; url: string; category?: string };

/** رابط من المرجعية بلا اقتباس (قرأته طبقة «ابحث واقرأ» ولم يُوثَّق نص منه). */
export type ChatLink = { title: string; url: string; site: string };

/** رأس الرد: نوعه ولغته واتجاهه وبطاقاته (في start، ومع النص في final). */
export type ChatReplyHead = {
  kind: ChatReplyKind;
  lang: string;
  dir: "rtl" | "ltr";
  level?: string;
  /** R5: الجواب عرض خلافاً فقهياً معتبراً (شارة «مسألة خلافية»). */
  khilaf?: boolean;
  sources: ChatSource[];
  /** للإحالة: نوع رسالتها، وللإحالة والامتناع: الباب ونوع السائل (لبدء الاستيضاح). */
  referral?: "personal" | "ruling";
  chapter?: string;
  userType?: string;
  /** «فتاوى منشورة ذات صلة» (تحت الجواب، أو قبل الإحالة في الحالة الشخصية). */
  fatwas?: ChatFatwa[];
  /** عند الامتناع: أسئلة قريبة يمكن الجواب عنها من المصادر. */
  suggestions?: string[];
  /** سطر ثابت بعد بطاقات الفتاوى في الحالة الشخصية («الأفضل لحالتك أن يراها مختص»). */
  note?: string;
  /** روابط من المصادر المعتمدة بلا اقتباس موثَّق. */
  links?: ChatLink[];
  /** سؤال تحقق من حديث: المتصفح يطلب الدرر بهذه العبارة (JSONP). */
  hadithCheck?: { query: string; fallback?: boolean };
};

export type ChatEvent =
  | { type: "stage"; stage: ChatStage }
  | ({ type: "start" } & ChatReplyHead)
  | { type: "delta"; text: string }
  | { type: "reset" }
  | ({ type: "final"; text: string } & ChatReplyHead)
  | { type: "done" }
  | { type: "error"; code: "rate_limited" | "busy" | "bad_request"; text?: string };

export type ChatHistoryItem = { role: "user" | "assistant"; content: string };

export const MAX_QUESTION_CHARS = 2000;
export const MAX_HISTORY = 6;

const RTL_LANGS = new Set(["ar", "ur", "fa", "ps", "ku", "ckb", "sd", "ug", "he", "yi", "dv"]);

/** اتجاه النص من رمز اللغة. */
export function dirForLang(lang: string | undefined): "rtl" | "ltr" {
  return RTL_LANGS.has((lang ?? "").toLowerCase().split(/[-_]/)[0]) ? "rtl" : "ltr";
}

/** اتجاه نص من أول حرف فيه (للسؤال قبل معرفة لغته): الحرف العربي أو العبري ⇒ RTL. */
export function dirForText(text: string): "rtl" | "ltr" {
  const first = text.match(/\p{L}/u)?.[0];
  return first && /[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(first) ? "rtl" : "ltr";
}
