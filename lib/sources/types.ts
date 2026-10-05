/**
 * الواجهة الموحدة لكل مصادر المرجعية.
 * كل موصّل يعيد نتائج بهذا الشكل، مهما كانت طريقة الوصول (MCP أو API أو بحث في الموقع).
 */
export type SourceResult = {
  title: string;
  /** مقتطف قصير من النص المنشور (لا الصفحة كاملة). */
  text: string;
  /** رابط النص في موقعه الأصلي، يظهر للسائل دائماً. */
  url: string;
  /** اسم المصدر للعرض (مثل «موسوعة الأحاديث النبوية»). */
  source: string;
  /** معرّف المصدر في السجل (registry.ts). */
  sourceId: SourceId;
  /** درجة الحديث كما ذكرها المصدر (إن وُجدت). */
  grade?: string;
  lang: string;
  /** معرّف النص في خادم MCP (لجلب نصه الكامل ودرجته بأداة fetch). */
  ref?: string;
  /** فتوى منشورة (عبر Quranpedia): المفتي أو الجهة، ونص السؤال، والجواب كاملاً للمقتطف الحرفي. */
  fatwa?: FatwaMeta;
};

export type FatwaMeta = {
  mufti: string;
  question: string;
  /** نص الجواب كما نُشر (بعد نزع وسوم HTML)، ومنه يُقتطع المقتطف الحرفي. */
  answer: string;
  category?: string;
  /** نطاق الفتوى الأصلي (من المرجعية حصراً). */
  host: string;
};

/** طرق الوصول بالترتيب المعتمد (الخطة 0.1 البند 4). */
export type AccessKind = "mcp" | "api" | "site";

export type SourceId =
  | "quranenc"
  | "hadeethenc"
  | "byenah"
  | "islamhouse"
  | "islamenc"
  | "terminologyenc"
  | "icadb"
  | "risala"
  | "dawa_center"
  | "jamhara"
  | "quranpedia"
  | "qurancomplex"
  | "dorar_hadith"
  | "dorar_tafseer"
  | "dorar_aqeeda"
  | "dorar_feqhia"
  | "dorar_history"
  | "shamela"
  | "tafsir_net"
  | "modoee"
  | "surahapp"
  | "wahy"
  | "mp3quran"
  | "kuwait_fiqh"
  | "islamqa"
  | "binbaz"
  | "binothaimeen"
  | "ksaa";

/** موصّل لطريقة وصول واحدة. يرمي خطأً عند الفشل (ولا يعيد [] بدل الخطأ)، حتى لا يُخزَّن الفشل. */
export type AccessMethod = {
  kind: AccessKind;
  /** وصف قصير لما يُستدعى (أداة MCP، أو مسار API، أو صفحة البحث). */
  via: string;
  search: (query: string, lang: string) => Promise<SourceResult[]>;
  /** للبحث المباشر: رابط صفحة البحث (للتشخيص فقط). */
  pageUrl?: (query: string, lang: string) => string;
};

export type SourceStatus = "ok" | "down" | "blocked" | "link_only";

/** خطأ «محجوب»: robots.txt يمنع، أو الموقع رد بـ 401/403/429/451 أو صفحة تحقق. */
export class BlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedError";
  }
}
