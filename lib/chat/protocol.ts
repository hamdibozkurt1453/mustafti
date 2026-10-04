/**
 * بروتوكول بث المحادثة بين /api/chat والواجهة: سطر JSON لكل حدث (NDJSON).
 *
 *   stage  ← مرحلة العمل (لمؤشر «يبحث في المصادر…»).
 *   start  ← نوع الرد ولغته واتجاهه وبطاقات المصادر (قبل أول كلمة).
 *   delta  ← جزء من النص (كلمة أو كلمات)، بالترتيب.
 *   done   ← اكتمل الرد.
 *   error  ← رسالة لطيفة ثابتة (بلا تفاصيل فنية ولا اسم نموذج).
 *
 * النص المبثوث هو رد مُستفتي بعد الحارس كاملاً (lib/brain/respond.ts)، فلا تصل كلمة لم تُفحص.
 */

export type ChatStage = "understanding" | "searching" | "writing";

export type ChatReplyKind = "identity" | "urgent" | "out_of_scope" | "referral" | "answer" | "abstain" | "refused";

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
};

export type ChatEvent =
  | { type: "stage"; stage: ChatStage }
  | { type: "start"; kind: ChatReplyKind; lang: string; dir: "rtl" | "ltr"; level?: string; sources: ChatSource[] }
  | { type: "delta"; text: string }
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
