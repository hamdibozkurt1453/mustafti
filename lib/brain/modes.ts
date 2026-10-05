/**
 * أوضاع المحادثة (R3): العامة في الرئيسية، و«المرشد» في /new-muslim، و«الداعية» في /discover.
 * الوضع لا يغيّر القواعد (لا فتوى، وكل جملة منسوبة إلى نص مسترجع، والامتناع كما هو)، وإنما:
 *   - ترتيب المصادر وأولويتها (sourceOrder، sourceBoost، rankBonus)،
 *   - ونبرة الصياغة (modeNote)،
 *   - ونوع السائل الافتراضي (modeUserType)،
 *   - ومسار المسألة عند الإحالة (track في cases، والمختص بحسب دوره: lib/case/routing.ts).
 * ملف نقي بلا server-only: يُستورد في الواجهة والخادم والاختبارات.
 */

export const CHAT_MODES = ["general", "new_muslim", "discover"] as const;
export type ChatMode = (typeof CHAT_MODES)[number];

/** مسار المسألة في cases.track: القيم نفسها (migration 20261009_case_track.sql). */
export const CASE_TRACKS = CHAT_MODES;
export type CaseTrack = ChatMode;

export function isChatMode(x: unknown): x is ChatMode {
  return typeof x === "string" && (CHAT_MODES as readonly string[]).includes(x);
}

/** مفاتيح نتائج المصادر الخام في retrieve() (المراجع المحددة و«الأساسيات» تسبقها دائماً). */
export type RawSourceKey = "bayyinat" | "library" | "islamqa" | "found" | "published" | "mcpExtra" | "quranSearch";

/**
 * ترتيب المصادر الخام قبل الترتيب الأولي (والتعادل يُحسم بالأسبق):
 *   - new_muslim: المكتبة (IslamHouse عبر MCP) ثم «بيّنات» ثم «الإسلام سؤال وجواب» المحلي، ثم الباقي.
 *   - discover: «بيّنات» أولاً، ثم المكتبة، ثم الباقي.
 *   - general: كما كان (بيّنات أولاً لأسئلة الشبهات، وإلا آخراً).
 * «الأساسيات» (data/basics.json) مراجع محددة تسبق هذا كله في كل الأوضاع.
 */
export function sourceOrder(mode: ChatMode, shubha: boolean): RawSourceKey[] {
  if (mode === "new_muslim") return ["library", "bayyinat", "islamqa", "found", "published", "mcpExtra", "quranSearch"];
  if (mode === "discover") return ["bayyinat", "library", "islamqa", "found", "published", "mcpExtra", "quranSearch"];
  return shubha
    ? ["bayyinat", "found", "islamqa", "published", "mcpExtra", "library", "quranSearch"]
    : ["found", "islamqa", "published", "mcpExtra", "library", "quranSearch", "bayyinat"];
}

/** المصادر المقدَّمة في كل وضع (معرّف المصدر sourceId في المرشح). */
const PREFERRED: Record<ChatMode, readonly string[]> = {
  general: [],
  new_muslim: ["islamhouse", "bayyinat", "islamqa"],
  discover: ["bayyinat", "islamhouse"],
};

/** زيادة تداخل الكلمات (kw) في الترتيب الأولي للمصدر المقدَّم: يدخل مجمع التقييم قبل غيره. */
export function sourceBoost(mode: ChatMode, sourceId: string): number {
  const i = PREFERRED[mode].indexOf(sourceId);
  return i < 0 ? 0 : PREFERRED[mode].length - i + 1;
}

/**
 * علاوة الترتيب النهائي (لا القبول): المقبول ما بلغ 60 في تقييم الصلة كما هو في كل الأوضاع،
 * والعلاوة تقدّم المصدر المفضّل على غيره عند تقارب الدرجات (حتى 8 نقاط).
 */
export function rankBonus(mode: ChatMode, sourceId: string): number {
  const i = PREFERRED[mode].indexOf(sourceId);
  return i < 0 ? 0 : 8 - i * 2;
}

/** «الأساسيات» المطابقة للسؤال: حتى اثنتين في الوضعين الموجّهين (الأولوية لمصادر المبتدئين). */
export function basicsLimit(mode: ChatMode, withPlan: boolean): number {
  return mode !== "general" ? 2 : withPlan ? 1 : 2;
}

/** مكتبة IslamHouse تُطلب دائماً في الوضعين الموجّهين. */
export function modeWantsLibrary(mode: ChatMode): boolean {
  return mode !== "general";
}

/**
 * نوع السائل في الوضع الموجّه: المصنّف لا يعرف الصفحة، فيُصحَّح «غير معروف» أو «مسلم» إلى نوع
 * الصفحة. لا يغيّر المستوى ولا العاجل ولا خارج النطاق.
 */
export function modeUserType(mode: ChatMode, userType: string): string | null {
  if (mode === "new_muslim" && userType !== "new_muslim") return "new_muslim";
  if (mode === "discover" && userType !== "non_muslim") return "non_muslim";
  return null;
}

/** نبرة الصياغة لكل وضع (تُضاف إلى تعليمات الجواب، ولا تغيّر القواعد غير القابلة للكسر). */
export function modeNote(mode: ChatMode): string {
  if (mode === "new_muslim") {
    return `GUIDE MODE (new Muslim): the asker recently embraced Islam. Be warm, welcoming and gentle, like a kind mentor; never scold or overwhelm. Use simple everyday words and short sentences, and explain any Arabic term in plain words the first time. Basics come first (the two testimonies, purification, prayer step by step, fasting, kind relations with non-Muslim family). When the passages describe steps (wudu, ghusl, prayer), give them in order as short separate lines, each with its [n]; never add a step that is not in the passages.`;
  }
  if (mode === "discover") {
    return `DA'I MODE (non-Muslim learning about Islam): be respectful and calm, with no pressure to convert and no repeated invitations. Never criticise, mock or belittle any other religion or its followers. Explain Islamic belief only as the passages state it. For a doubt or objection about Islam, prefer quoting the «بيّنات» passage verbatim inside «…» with its [n].`;
  }
  return "";
}
