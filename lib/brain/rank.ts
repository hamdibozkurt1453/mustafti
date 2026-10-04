import { matchKey } from "./guard";

/**
 * تنظيف المرشحين وترتيبهم الأولي (نقي بلا شبكة، فيُختبر محلياً). يستعمله retrieval.ts.
 */

export type Candidate = {
  title: string;
  text: string;
  url: string;
  source: string;
  sourceId: string;
  grade?: string;
  lang?: string;
  ref?: string;
  /** درجة التداخل الأولية. */
  kw?: number;
  /** درجة الصلة من النموذج (0–3). */
  score?: number;
  enriched?: boolean;
  /** مرجع محدد (خطة الإحالات أو آية في السؤال): لا يمر بالتنظيف ولا بالترتيب بالكلمات. */
  pinned?: boolean;
};

export type Dropped = { reason: string; source: string; title: string };

/** أدوات الاستفهام والحروف (بعد التوحيد) لا تُعدّ كلمات بحث. */
export const STOP =
  /^(ما|ماذا|لماذا|هل|كيف|من|متى|اين|معني|هي|هو|في|عن|علي|الي|ان|لا|او|هذا|هذه|ذلك|التي|الذي|كل|بين|مع|لم|لن|قد|يا|ليس|اليس|لشخص|يسمع|قبل|بعد|the|a|an|is|are|do|does|did|what|why|how|who|in|of|to|and|or|it|its|isn|just|for|on|with|not|apa|saja|dalam|yang|dan|ne|nedir|kimlere|mi|le|la|les|des|un|une|est|ce|que|qui|کے|کی|کا|کیا|ہیں|ہے)$/i;

/** كلمات مفيدة موحّدة (للمطابقة). */
export function keywords(text: string): string[] {
  return matchKey(text)
    .split(" ")
    .map((w) => w.replace(/^(وال|فال|بال|كال|لل|ال)(?=..)/, ""))
    .filter((w) => w.length > 2 && !STOP.test(w));
}

/** وصف كتاب أو مادة لا محتوى فيه (مثل «رسالة موجزة عن الإسلام…» المكررة في كل سؤال). */
const BOOK_BLURB =
  /^(كتاب|كتيب|رسالة|مطوية|مقال|محاضرة|سلسلة|مجموعة|book|booklet|a\s+book|this\s+book|an\s+article|a\s+brief)(?=\s|[:،,.]|$)|كتاب\s+(نافع|قيم|مفيد|مختصر)|يحتوي\s+(هذا\s+)?(الكتاب|على\s+تعريف)|(this|the)\s+book\s+(contains|is|explains)|الرسالة\s+مو[جّ]هة/iu;

/** عناصر واجهة المواقع (أزرار وتواريخ) بدل المحتوى. */
const UI_JUNK = /(حفظ|قائمة جديدة|تنزيل|مشاركة|طباعة|نسخ|save|download|share|print|\d{1,2}\/\d{1,2}\/\d{4})/giu;

/** النص بلا الأقواس الفارغة، أو "" إن كان أغلبه عناصر واجهة. */
function cleanText(text: string): string {
  const t = text.replace(/﴿\s*﴾/g, "").replace(/\s+/g, " ").trim();
  const rest = t.replace(UI_JUNK, " ").replace(/\s+/g, " ").trim();
  return rest.length >= 20 && rest.length >= t.length * 0.5 ? t : "";
}

/** ينظف المرشحين: نص من العنوان إن كان المقتطف واجهة، وحذف أوصاف الكتب والمكرر. */
export function clean<T extends Candidate>(results: T[], dropped: Dropped[]): T[] {
  const seenUrl = new Set<string>();
  const seenText = new Set<string>();
  const out: T[] = [];
  for (const r of results) {
    const title = (r.title ?? "").trim();
    let text = cleanText(r.text ?? "");
    // المقتطف مطابق للعنوان أو فارغ: العنوان هو النص (أسئلة الإسلام سؤال وجواب ونصوص الأحاديث).
    if (!text || matchKey(text) === matchKey(title)) text = cleanText(title);
    if (!text) {
      dropped.push({ reason: "empty", source: r.source, title });
      continue;
    }
    if (BOOK_BLURB.test(text)) {
      dropped.push({ reason: "book_blurb", source: r.source, title });
      continue;
    }
    const key = matchKey(text).slice(0, 160);
    if (seenUrl.has(r.url) || seenText.has(key)) {
      dropped.push({ reason: "duplicate", source: r.source, title });
      continue;
    }
    seenUrl.add(r.url);
    seenText.add(key);
    out.push({ ...r, title, text });
  }
  return out;
}

/** تداخل الكلمات: كم كلمة من السؤال وكلمات البحث في العنوان والنص (العنوان بوزن مضاعف). */
export function overlap(c: Candidate, terms: string[]): number {
  const title = new Set(keywords(c.title));
  const body = new Set(keywords(c.text));
  return terms.reduce((s, t) => s + (title.has(t) ? 2 : 0) + (body.has(t) ? 1 : 0), 0);
}

/**
 * ترتيب أولي مع حصة: أفضل نصين من كل مصدر أولاً (فلا يُقصى بيان الإسلام مثلاً لأن الأحاديث
 * أكثر عدداً)، ثم الباقي بالدرجة.
 */
export function prerank<T extends Candidate>(cands: T[], terms: string[], pool = 14): T[] {
  const scored = cands.map((c) => ({ ...c, kw: overlap(c, terms) })).sort((a, b) => b.kw! - a.kw!);
  const picked: T[] = [];
  const bySource = new Map<string, T[]>();
  for (const c of scored) bySource.set(c.sourceId, [...(bySource.get(c.sourceId) ?? []), c]);
  for (const list of bySource.values()) for (const c of list.slice(0, 2)) if (c.kw! > 0) picked.push(c);
  for (const c of scored) {
    if (picked.length >= pool) break;
    if (!picked.includes(c)) picked.push(c);
  }
  return picked.slice(0, pool).sort((a, b) => b.kw! - a.kw!);
}


// ---------------------------------------------------------------------------
// إعادة الترتيب بالصلة: معرّفات صريحة (S1، S2…) تُطابق بالمعرّف لا بالترتيب
// ---------------------------------------------------------------------------

/** معرّف قصير للمرشح في طلب التقييم. */
export const rerankId = (i: number) => `S${i + 1}`;

/** قائمة المرشحين كما تُرسل للمقيّم، كل نص بمعرّفه. */
export function rerankList(cands: Candidate[]): string {
  return cands
    // المرجع المحدد يُرسل بنص أطول (الآية واسم السورة والتفسير، أو الحديث بدرجته وشرحه).
    .map((c, i) => `[${rerankId(i)}] ${c.source} — ${clip(c.title, 140)}\n${clip(c.text, c.pinned ? 900 : 420)}`)
    .join("\n\n");
}

/**
 * يطبّق درجات المقيّم بالمعرّف: «S3» أو «3» أو «[S3]» كلها للمرشح الثالث، وما لم يُقيَّم يأخذ 0.
 * لا يُستعمل ترتيب الرد أبداً، فلا تنزاح الدرجات إن رتّب النموذج أو أسقط بعض النصوص.
 */
export function applyScores(cands: Candidate[], scores: { id: string; score: number }[]): void {
  const byId = new Map<string, number>();
  for (const s of scores) {
    const n = String(s.id).match(/\d+/)?.[0];
    if (n) byId.set(`S${Number(n)}`, Math.max(0, Math.min(3, Math.round(s.score))));
  }
  cands.forEach((c, i) => (c.score = byId.get(rerankId(i)) ?? 0));
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/**
 * يزيل من نص أداة MCP ما ليس محتوى: فواصل «────»، وأقسام CITE، وتعليمات الخادم للنموذج
 * (مثل «[EXACT] the narration itself — reproduce these words exactly…»).
 */
export function cleanToolText(raw: string): string {
  return (
    raw
      // ذيل الرد (CITE، أو «END OF RETRIEVED TEXT» وما بعده) ليس من النص المنشور.
      .replace(/─{3,}\s*(?:CITE|END OF RETRIEVED TEXT)[\s\S]*$/i, "")
      // رأس «──── RETRIEVED FROM … ────» في أي موضع، ولو كان النص سطراً واحداً.
      .replace(/─{3,}[^─]*?─{3,}/g, "\n")
      .replace(/─{3,}/g, " ")
      .split("\n")
      .filter((line) => !/^\s*(CITE|Every (result|item) you carry)/i.test(line))
      .join("\n")
      // تعليمات الخادم للنموذج بعد الوسم حتى آخر السطر (النص المنشور في السطر التالي).
      .replace(/\s*\[[A-Z][A-Z _-]{2,}\][^\n]*/g, (m) =>
        /reproduce|exactly|verbatim|do not|don't|must|cite|paraphras|instruction|attributed to them|say so/i.test(m) ? "" : m,
      )
      .replace(/\[\/?[A-Z][A-Z _-]{2,}\]/g, " ")
      .replace(/[#*_`>]/g, "")
      .replace(/[ \t]+/g, " ")
      .trim()
  );
}

const AR = "\\u0600-\\u06FF\\u0750-\\u077F";

/**
 * اسم السورة ورقمها وعدد آياتها كما يذكرها رد get_quran_verses (لا شيء من خارج الرد):
 * الاسم من «سورة X» أو «X 3:1» أو «(X)»، والرقم إن ورد «3:1»، والعدد إن ذكر الرد «200 آية/verses».
 */
export function surahInfoFromText(text: string, surah: number): { name?: string; number?: number; count?: number } {
  const t = text.replace(/[\u064B-\u065F\u0670\u0640]/g, "");
  const name =
    t.match(new RegExp(`سورة\\s+([${AR}]+(?:\\s[${AR}]+)?)`, "u"))?.[1] ??
    t.match(new RegExp(`([${AR}]+(?:\\s[${AR}]+)?)\\s*\\(?\\s*${surah}\\s*[:：]\\s*\\d`, "u"))?.[1] ??
    t.match(new RegExp(`\\(\\s*([${AR}]+(?:\\s[${AR}]+)?)\\s*\\)`, "u"))?.[1];
  const number = new RegExp(`(?<!\\d)${surah}\\s*[:：]\\s*\\d`).test(t) ? surah : undefined;
  const count = Number(
    t.match(/(\d{1,3})\s*(?:آية|آيات|verses|ayahs|ayat|āyāt)/i)?.[1] ??
      t.match(/(?:عدد\s+(?:ال)?آيات(?:ها)?|verses|ayahs|verse count)\s*[:：]?\s*(\d{1,3})/i)?.[1],
  );
  const clean = name?.trim().replace(/^سورة\s+/, "");
  return {
    name: clean && !/^(قال|الله|تعالى|بسم)$/.test(clean) ? clean : undefined,
    number,
    count: Number.isInteger(count) && count > 0 && count <= 286 ? count : undefined,
  };
}
