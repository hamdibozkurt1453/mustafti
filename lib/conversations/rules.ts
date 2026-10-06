/**
 * F2: قواعد سجل المحادثات الصرفة (بلا شبكة ولا قاعدة)، للاختبار:
 * تجميع المحادثات بالتاريخ، والعنوان من أول سؤال، والبحث، وتحويل رسائل الواجهة إلى صفوف والعكس.
 */

export const CONVERSATION_MODES = ["general", "new_muslim", "discover"] as const;
export type ConversationMode = (typeof CONVERSATION_MODES)[number];

export const TITLE_MAX = 80;
/** حد الرسائل المحفوظة في المحادثة الواحدة (كحد التخزين المحلي). */
export const MAX_SAVED_MESSAGES = 60;
/** حد المحادثات في الشريط الجانبي. */
export const LIST_LIMIT = 200;

export type ConversationSummary = { id: string; title: string; mode: ConversationMode; updatedAt: string };

export const GROUPS = ["today", "yesterday", "week", "older"] as const;
export type ConversationGroup = (typeof GROUPS)[number];

/** بداية اليوم بتوقيت المتصفح. */
function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** مجموعة المحادثة بآخر نشاط: اليوم، أمس، آخر 7 أيام، أقدم. */
export function groupOf(updatedAt: Date, now: Date): ConversationGroup {
  const today = startOfDay(now);
  const day = 24 * 60 * 60 * 1000;
  const t = updatedAt.getTime();
  if (t >= today) return "today";
  // أمس: من بداية أمس التقويمي (مع تغيّر التوقيت الصيفي: بداية يوم أمس الفعلية).
  const yesterday = startOfDay(new Date(today - day / 2));
  if (t >= yesterday) return "yesterday";
  if (t >= today - 7 * day) return "week";
  return "older";
}

/** المحادثات مجمّعة بترتيب المجموعات، والأحدث أولاً داخل كل مجموعة. المجموعة الفارغة لا تظهر. */
export function groupConversations<T extends { updatedAt: string }>(items: T[], now: Date): { group: ConversationGroup; items: T[] }[] {
  const sorted = [...items].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return GROUPS.map((group) => ({ group, items: sorted.filter((c) => groupOf(new Date(c.updatedAt), now) === group) })).filter(
    (g) => g.items.length > 0,
  );
}

/** العنوان من أول سؤال: سطر واحد بلا مسافات زائدة، حتى 80 حرفاً بعلامة الحذف. */
export function titleFrom(question: string): string {
  const s = question.replace(/\s+/g, " ").trim();
  if (s.length <= TITLE_MAX) return s;
  return `${s.slice(0, TITLE_MAX - 1).trimEnd()}…`;
}

/** العنوان بعد إعادة التسمية، أو null إن كان فارغاً. */
export function cleanTitle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
  return s || null;
}

const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u064B-\u0655\u0670\u0640\u0300-\u036f]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase();

/** البحث في العناوين: كل كلمات البحث موجودة (بلا تشكيل ولا فرق في الهمزات وحالة الأحرف). */
export function searchConversations<T extends { title: string }>(items: T[], query: string): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  return items.filter((c) => {
    const title = fold(c.title);
    return words.every((w) => title.includes(w));
  });
}

// ---------------------------------------------------------------------------
// رسائل الواجهة ↔ صفوف messages
// ---------------------------------------------------------------------------

/** رسالة كما في الواجهة (useChat): المعرّف والدور والنص، وبقية الحقول تُحفظ في reply كما هي. */
export type UiMessage = { id: string; role: "user" | "bot"; text: string; status?: string } & Record<string, unknown>;

export type MessageRow = { id: string; seq: number; role: "user" | "bot"; content: string; reply: Record<string, unknown> };

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** حقول مؤقتة لا تُحفظ (مرحلة الانتظار وسطر المرحلة). */
const TRANSIENT = new Set(["id", "role", "text", "stage", "caseStage"]);

/**
 * الرسائل المكتملة فقط تُحفظ: رسالة السائل، وجواب مُستفتي بعد اكتماله (لا الجاري ولا المنقطع).
 * آخر 60 رسالة، بترتيبها (seq).
 */
export function toRows(messages: UiMessage[]): MessageRow[] {
  return messages
    .filter((m) => UUID_RE.test(m.id) && (m.role === "user" || m.status === "done"))
    .slice(-MAX_SAVED_MESSAGES)
    .map((m, seq) => {
      const reply: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(m)) if (!TRANSIENT.has(k) && v !== undefined) reply[k] = v;
      return { id: m.id.toLowerCase(), seq, role: m.role, content: String(m.text ?? "").slice(0, 20000), reply };
    });
}

/** الصفوف إلى رسائل الواجهة بترتيبها، كما كانت عند الحفظ (بمصادرها وبطاقاتها). */
export function fromRows(rows: MessageRow[]): UiMessage[] {
  return [...rows]
    .sort((a, b) => a.seq - b.seq)
    .map((r) => {
      const base = { ...(r.reply ?? {}), id: r.id, role: r.role, text: r.content };
      return r.role === "bot" ? { sources: [], question: "", ...base, status: "done" } : base;
    });
}

/** أول سؤال حقيقي (لا جواب استيضاح) عنواناً للمحادثة. */
export function firstQuestion(messages: UiMessage[]): string {
  const first = messages.find((m) => m.role === "user" && !m.case && m.text.trim());
  return first ? first.text : "";
}
