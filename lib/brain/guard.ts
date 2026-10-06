import { MESSAGES, message } from "./messages";

/**
 * الحارس: فحص بالكود (بلا نموذج) لكلام الأداة قبل أن يصل إلى السائل. له وضعان:
 *
 * أ) الحارس الصارم `guard()` / `checkOutput()` لكلام الأداة **غير الجواب** (الردود الثابتة،
 *    وأسئلة الاستيضاح وملف المسألة في D، والأسئلة المقترحة): لا حكم ولا ترجيح ولا اقتباس بلا أصل
 *    ولا اسم نموذج، بست لغات (ar en tr fr ur id)، وعند الاكتشاف يُستبدل الكلام كله برد ثابت.
 *    كل مقطع بين علامات الاقتباس (« » ﴿ ﴾ “ ” " ") يُعدّ منقولاً **فقط إن وُجد حرفياً** (بعد توحيد
 *    التشكيل والهمزات) في النصوص المسترجعة أو في سؤال السائل، فلا يُهرَّب حكم في علامات اقتباس.
 *
 * ب) حارس الجواب (R5c: `checkAnswer` / `repairAnswer`): الجواب يكتبه مساعد مسلم بعلمه بحرية
 *    كاملة، والمصادر [n] تقوّيه ولا تشترط لكل جملة. يتدخل في ثلاث حالات فقط، ويُعدِّل ولا يبتر:
 *    1) نص منسوب (آية، أو حديث، أو قول عالم) بين علامات اقتباس غير مطابق لمصدر مسترجع: يُصحَّح
 *       إلى نص المصدر إن قاربه، وإلا تُحذف العلامات والنسبة ويبقى المعنى بصيغة «ورد في السنة ما معناه».
 *    2) فتوى شخصية لحالة فردية («طلاقك واقع»، «صلاتك باطلة»، «يجوز لك»): تمنع الجواب (إعادة، ثم إحالة).
 *    3) اسم نموذج لغوي أو شركة، أو محتوى مسيء: تُحذف جملته وحدها.
 *    وما عدا ذلك يمر كما هو: الأذكار والأدعية والخطوات والشرح وأعداد الركعات والأحكام العامة.
 *
 * الملف نقي (بلا server-only) ليُختبر محلياً بلا نموذج: tests/brain.test.ts وtests/r5c.test.ts.
 */

export type GuardReason = "ruling" | "tarjih" | "unsourced_quote" | "identity_leak" | "offensive";

/**
 * verdict: حكم على حالة السائل نفسه («صلاتك باطلة»، «طلاقك واقع»، «أفتيك»): فتوى شخصية تُمنع
 * دائماً. وغيره من عبارات الحكم لا يمنعه إلا الحارس الصارم (كلام الأداة غير الجواب).
 */
export type GuardFinding = { reason: GuardReason; lang: string; match: string; verdict?: boolean };

export type GuardContext = {
  /** نصوص المصادر المسترجعة المرفقة بالتعليمات (ما يجوز اقتباسه). */
  sources?: string[];
  /** سؤال السائل (يجوز اقتباسه عند تصحيح تصوّر خاطئ أو آية منقولة بخطأ). */
  question?: string;
  /** لغة السائل، للرد الثابت. */
  lang?: string;
  /** عدد النصوص المرقّمة (إشارة [n] صحيحة إن كانت بين 1 وهذا العدد). الافتراضي: عدد sources. */
  citeCount?: number;
};

export type GuardResult = {
  ok: boolean;
  /** النص الذي يُعرض: الأصلي إن سلم، وإلا الرد الثابت. */
  text: string;
  original: string;
  findings: GuardFinding[];
  /** صياغة الأداة بعد إخراج المقتبس الموثَّق (⟦Q⟧ مكان كل اقتباس). للتشخيص. */
  ownText: string;
};

// ---------------------------------------------------------------------------
// التوحيد والاقتباسات
// ---------------------------------------------------------------------------

/** يزيل التشكيل والتطويل وعلامات المصحف (يبقي الحروف كما هي). */
export function stripMarks(text: string): string {
  return text.normalize("NFC").replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, "");
}

/** توحيد للمطابقة الحرفية بين الاقتباس والمصدر: حروف وأرقام فقط، بلا تشكيل ولا اختلاف همزات. */
export function matchKey(text: string): string {
  return stripMarks(text)
    .normalize("NFKC")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const QUOTE_PAIRS: [string, string][] = [
  ["«", "»"],
  ["﴿", "﴾"],
  ["“", "”"],
  ["„", "“"],
  ['"', '"'],
];

/** الاقتباس القصير (اسم مصطلح مثلاً) لا يُعدّ نصاً منقولاً، فيبقى ضمن صياغة الأداة. */
const MIN_QUOTE_KEY = 12;
/** أقل طول لكل جزء من اقتباس مقطوع بـ «…». */
const MIN_FRAGMENT_KEY = 6;

const FIXED_TEXTS: string[] = Object.values(MESSAGES).flatMap((byLang) => Object.values(byLang));

/**
 * وسم «ترجمة المعنى» بلغات الواجهة: حين يكون النص المصدر بغير لغة السائل، تُعرض ترجمته
 * خارج علامات الاقتباس موسومة بهذا الوسم، ومعها إشارة [n] إلى النص الأصلي.
 */
export const TRANSLATION_MARKER =
  /ترجمة\s+(?:ال)?معن[ىي]|translation\s+of\s+(?:the\s+)?meaning|anlam(?:ı|\s+tercümesi)|meal(?:i)?\b|traduction\s+(?:du|de)\s+sens|ترجم(?:ۂ|ہ)\s+معنی|مفہوم\s+کا\s+ترجمہ|terjemahan\s+makna/iu;

/** ترجمة موسومة: الوسم وإشارة [n] قريبان من المقطع (قبله أو بعده). */
export function isMarkedTranslation(text: string, start: number, end: number): boolean {
  const around = text.slice(Math.max(0, start - 60), start) + " " + text.slice(end, end + 60);
  return TRANSLATION_MARKER.test(around) && /\[\s*\d{1,2}\s*\]/.test(around);
}

type Quote = { start: number; end: number; inner: string };

/**
 * معنى بلغة السائل بين علامات اقتباس في جواب غير عربي (R5b): نص بلا حرف عربي، وبجواره إشارة [n].
 * ليس اقتباساً حرفياً من المصدر العربي (فلا يُطلب تطابقه)، بل صياغة للأداة تُفحص كغيرها.
 * («Abdestsiz namaz kabul olmaz» [1] في جواب تركي عن حديث عربي.)
 */
function isQuotedMeaning(text: string, q: Quote, ctx: GuardContext): boolean {
  if (!ctx.lang || ctx.lang === "ar" || /[\u0600-\u06FF]/.test(q.inner)) return false;
  const around = text.slice(Math.max(0, q.start - 40), q.start) + " " + text.slice(q.end, q.end + 40);
  return /\[\s*\d{1,2}\s*\]/.test(around);
}

export function findQuotes(text: string): Quote[] {
  const quotes: Quote[] = [];
  for (const [open, close] of QUOTE_PAIRS) {
    let from = 0;
    while (true) {
      const s = text.indexOf(open, from);
      if (s === -1) break;
      const e = text.indexOf(close, s + open.length);
      if (e === -1) break;
      quotes.push({ start: s, end: e + close.length, inner: text.slice(s + open.length, e) });
      from = e + close.length;
    }
  }
  // إزالة المتداخل: يبقى الأوسع.
  quotes.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Quote[] = [];
  for (const q of quotes) {
    const last = kept[kept.length - 1];
    if (last && q.start < last.end) continue;
    kept.push(q);
  }
  return kept;
}

/** هل الاقتباس موجود حرفياً (بكل أجزائه إن قُطع بـ «…») في أحد النصوص المرجعية؟ */
export function isVerbatim(inner: string, haystacks: string[]): boolean {
  const keys = haystacks.map(matchKey);
  const fragments = inner
    .split(/\.\.\.|…|\[\s*\.\.\.\s*\]/)
    .map(matchKey)
    .filter((f) => f.length >= MIN_FRAGMENT_KEY);
  if (!fragments.length) return false;
  return fragments.every((f) => keys.some((k) => k.includes(f) || nearVerbatim(f, k)));
}

/** كلمات الاقتباس (بحروفها الأصلية) غير الموجودة في أي نص مرجعي؛ "" للاقتباس الحرفي. */
function extraWords(inner: string, haystacks: string[]): string {
  const words = new Set(haystacks.flatMap((h) => matchKey(h).split(" ")));
  return stripMarks(inner)
    .split(/\s+/)
    .filter((w) => {
      const k = matchKey(w);
      return k && !k.split(" ").every((x) => words.has(x));
    })
    .join(" ");
}

/** حد الاقتباس شبه الحرفي: نسبة كلماته الموجودة في النص، ونسبة ما جاء منها بترتيبه. */
export const NEAR_COVERAGE = 0.85;
export const NEAR_ORDER = 0.7;

/** طول أطول تتابع مشترك (بالترتيب) بين قائمتي كلمات. */
/** الاقتباس موجود حرفياً تماماً (بعد التوحيد) بكل أجزائه، بلا قبول شبه الحرفي. */
export function isExactVerbatim(inner: string, haystacks: string[]): boolean {
  const keys = haystacks.map(matchKey);
  const fragments = inner
    .split(/\.\.\.|…|\[\s*\.\.\.\s*\]/)
    .map(matchKey)
    .filter((f) => f.length >= MIN_FRAGMENT_KEY);
  return fragments.length > 0 && fragments.every((f) => keys.some((k) => k.includes(f)));
}

function lcs(a: string[], b: string[]): number {
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const row = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) row[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], row[j - 1]);
    prev = row;
  }
  return prev[b.length];
}

/**
 * اقتباس شبه حرفي (كلاهما موحَّد بـ matchKey): بعض نصوص «بيّنات» مستخرجة من PDF بترتيب كلمات
 * مضطرب، فيعيد النموذج ترتيبها. يُقبل إن وُجد ≥85% من كلماته في النص و≥70% منها بترتيبه.
 * للاقتباس من 4 كلمات فأكثر فقط؛ والأقصر يجب أن يكون حرفياً.
 */
export function nearVerbatim(quoteKey: string, sourceKey: string): boolean {
  const q = quoteKey.split(" ").filter(Boolean);
  if (q.length < 4) return false;
  const src = sourceKey.split(" ").filter(Boolean);
  const set = new Set(src);
  const covered = q.filter((w) => set.has(w)).length / q.length;
  if (covered < NEAR_COVERAGE) return false;
  return lcs(q, src) / q.length >= NEAR_ORDER;
}

/**
 * يفصل صياغة الأداة عن النص المنقول الموثَّق.
 * يعيد ownText (الاقتباسات الموثقة مستبدلة بـ ⟦Q⟧) وقائمة الاقتباسات غير الموثقة.
 */
export function separateQuoted(text: string, ctx: GuardContext = {}): { ownText: string; unverified: string[] } {
  // الردود الثابتة (messages.ts) مكتوبة بأيدينا، فما بين علامات الاقتباس فيها ليس اقتباساً بلا أصل.
  const haystacks = [...(ctx.sources ?? []), ctx.question ?? "", ...FIXED_TEXTS].filter(Boolean);
  const unverified: string[] = [];
  let ownText = "";
  let cursor = 0;
  for (const q of findQuotes(text)) {
    ownText += text.slice(cursor, q.start);
    cursor = q.end;
    const key = matchKey(q.inner);
    if (key.length < MIN_QUOTE_KEY) {
      ownText += text.slice(q.start, q.end); // مصطلح أو كلمة: صياغة الأداة
    } else if (isVerbatim(q.inner, haystacks)) {
      // شبه الحرفي: الكلمات التي ليست في النص المصدر تبقى صياغةً للأداة فيفحصها الحارس.
      ownText += ` ⟦Q⟧ ${extraWords(q.inner, haystacks)} `;
    } else if (isMarkedTranslation(text, q.start, q.end) || isQuotedMeaning(text, q, ctx)) {
      // ترجمة معنى موسومة بجوار إشارة [n]، أو معنى بلغة السائل غير العربية بين علامات اقتباس
      // (R5b): صياغة للأداة (تُفحص كلها، ونسبة الحديث بلا نص عربي موثَّق تبقى ممنوعة).
      ownText += ` ${q.inner} `;
    } else {
      unverified.push(q.inner.trim());
      ownText += text.slice(q.start, q.end);
    }
  }
  ownText += text.slice(cursor);
  return { ownText, unverified };
}

// ---------------------------------------------------------------------------
// الأنماط
// ---------------------------------------------------------------------------

/** حدود الكلمة لكل الحروف (\b في JS لا يعرف الحروف العربية ولا التركية). */
const B = "(?<![\\p{L}\\p{M}])";
const E = "(?![\\p{L}\\p{M}])";
/** سوابق عربية متصلة: و ف ب ل ك، ثم «ال» اختيارياً. */
const AR_PRE = "(?:[وفبلك])?(?:ال)?";

function ar(body: string): RegExp {
  return new RegExp(`${B}${AR_PRE}(?:${body})${E}`, "u");
}
function w(body: string): RegExp {
  return new RegExp(`${B}(?:${body})${E}`, "iu");
}

/** «حرام» في أسماء الأماكن والأزمنة ليست حكماً. */
const AR_HARAM = `(?<!(?:المسجد|مسجد|البيت|بيت|الشهر|شهر|البلد|بلد|المشعر|مشعر)\\s+)حرام`;
const EN_HARAM = `(?<!(?:masjid|al|el|mescid-i|mescidi|masjid-al|masjid\\s+al)[\\s-]*)haram(?![\\s-]*(?:mosque|sharif|şerif|sanctuary|area|of\\s+(?:makkah|mecca|madinah|medina)|al-|el-))`;
/** «اسأل مختصاً» ليست إلزاماً بحكم. */
const AR_CONSULT = "(?!\\s*(?:ت?سأل|تسال|تراجع|تستشير|ترسل|تتواصل|تعرض|تستفتي|تتصل|ترجع))";
const EN_CONSULT =
  "(?!\\s+(?:ask|consult|contact|reach|send|speak|talk|refer|seek|check\\s+with|get\\s+in\\s+touch|turn\\s+to|clarify|describe))";

type Pattern = { reason: GuardReason; lang: string; re: RegExp; verdict?: boolean };

const P = (reason: GuardReason, lang: string, ...res: RegExp[]): Pattern[] => res.map((re) => ({ reason, lang, re }));
/** عبارات الحكم على حالة السائل نفسه (فتوى شخصية): تُمنع في كل الأحوال. */
const V = (lang: string, ...res: RegExp[]): Pattern[] => res.map((re) => ({ reason: "ruling" as const, lang, re, verdict: true }));

const PATTERNS: Pattern[] = [
  // العربية
  ...P(
    "ruling",
    "ar",
    ar("(?:لا\\s+)?[يت]جوز"),
    ar("(?:غير\\s+)?جائز[ةه]?"),
    ar(AR_HARAM),
    ar("حلال"),
    ar("مباح[ةه]?|يباح|مكروه[ةه]?|مستحب[ةه]?"),
    ar("محر[ّ]?م[ةه]?\\s+شرع"),
    ar("لا\\s+بأس"),
    ar("(?:وقع|يقع|تقع|وقعت|لم\\s+يقع|لا\\s+يقع)\\s+(?:ال)?(?:طلاق|طلقة|طلقتان)"),
    ar("طلاق(?:ه|ها)?\\s+(?:واقع|وقع|صحيح|باطل|نافذ|لم\\s+يقع)"),
    ar("(?:يجب|يلزم|يتعين|يتعيّن|ينبغي|يُشترط|يشترط)\\s+عليك"),
    ar("يلزمك|يلزمكم"),
    ar(`عليك\\s+[أا]ن${AR_CONSULT}`),
    ar("عليك\\s+(?:الكفارة|كفارة|القضاء|قضاء|الإعادة|الاعادة|إعادة|اعادة|الصيام|صيام|الفدية|فدية|الغسل|غسل)"),
    ar("(?:حكمه|حكمها|الحكم)\\s+(?:هو\\s+)?(?:الجواز|التحريم|الحرمة|الوجوب|الكراهة|الإباحة|الاباحة|الاستحباب)"),
  ),
  ...V(
    "ar",
    ar("طلاق(?:ك|كم)\\s+(?:واقع|وقع|صحيح|باطل|نافذ|لم\\s+يقع)"),
    ar(
      "(?:صلاتك|صومك|صيامك|زواجك|نكاحك|عقدك|حجك|عمرتك|وضوؤك|وضوءك|طهارتك|زكاتك|توبتك|صلاتكم|صيامكم)\\s+(?:صحيح[ةه]?|باطل[ةه]?|فاسد[ةه]?|مقبول[ةه]?|لا\\s+[يت]صح|[يت]صح)",
    ),
    ar("أفتيك|افتيك|فتواي"),
    // الجواز والتحريم موجَّهين إلى السائل نفسه («يجوز لك»، «حرام عليك»): صيغة فتوى شخصية.
    ar("(?:لا\\s+)?[يت]جوز\\s+(?:لك|لكم|لكما|لكن)"),
    ar("(?:جائز|حلال|مباح)[ةه]?\\s+(?:لك|لكم)|حرام\\s+(?:عليك|عليكم)"),
    ar("[يت]حرم\\s+(?:عليك|عليكم|عليكما|عليكن)|محر[ّ]?م[ةه]?\\s+(?:عليك|عليكم)"),
    ar("[يت]حل\\s+لك|يحق\\s+لك"),
  ),
  ...P("tarjih", "ar", ar("الراجح|الأرجح|الارجح|أرجح\\s+الأقوال|القول\\s+الصحيح|الصواب\\s+[أا]ن")),

  // English
  ...P(
    "ruling",
    "en",
    w("(?:im)?permissible|not\\s+permissible"),
    w(EN_HARAM),
    w("halal|makruh|makrooh|mubah"),
    w("(?:is|are|it's|was|be)\\s+(?:not\\s+)?(?:allowed|forbidden|prohibited|lawful|unlawful|a\\s+sin|sinful)"),
    w(`you\\s+(?:must|have\\s+to|need\\s+to|are\\s+(?:obliged|required|obligated)\\s+to|should|ought\\s+to)${EN_CONSULT}`),
    w("(?:the\\s+|your\\s+)?(?:divorce|talaq)\\s+(?:has\\s+)?(?:occurred|counts|took\\s+effect|is\\s+(?:valid|effective|binding|void)|did\\s+not\\s+(?:occur|count))"),
    w("the\\s+(?:islamic\\s+)?ruling\\s+(?:is|would\\s+be)"),
  ),
  ...V(
    "en",
    w(
      "your\\s+(?:prayer|salah|salat|fast|fasting|marriage|nikah|divorce|contract|hajj|umrah|wudu|wudhu|ablution|zakat|repentance)\\s+(?:is|was)\\s+(?:not\\s+)?(?:valid|invalid|void|accepted|correct|broken|nullified|sound)",
    ),
    w("your\\s+(?:divorce|talaq)\\s+(?:has\\s+)?(?:occurred|counts|took\\s+effect|did\\s+not\\s+(?:occur|count))"),
    w("my\\s+fatwa|i\\s+rule\\s+that"),
    w("you\\s+(?:may|can|are\\s+allowed\\s+to)\\s+(?:not\\s+)?(?:eat|drink|marry|pray|fast|take|keep|work|use|break|combine|skip|delay|divorce|celebrate|listen)"),
  ),
  ...P(
    "tarjih",
    "en",
    w("(?:the\\s+)?(?:stronger|strongest|correct|preponderant|most\\s+correct|soundest|preferred)\\s+(?:view|opinion|position)\\s+is"),
  ),

  // Türkçe
  ...P(
    "ruling",
    "tr",
    w("c[aâ]iz(?:dir|di|dır)?|c[aâ]iz\\s+değil(?:dir)?"),
    w(`${EN_HARAM}(?:dır|dir|tır)?`),
    w("helal(?:dir|dır)?|mekruh(?:tur)?|mubah(?:tır)?"),
    w("günahtır|günah\\s+(?:değildir|değil|sayılır)"),
    w("(?:boşanma|talak)\\s+(?:gerçekleşti|gerçekleşmiştir|düştü|düşmüştür|geçerli(?:dir)?|vaki\\s+olmuştur)"),
    w("(?!(?:sor|danış|başvur|ilet|gönder|yaz)m)\\p{L}+(?:malı|meli)(?:sınız|siniz|sın|sin)"),
    w("hüküm\\s+(?:şudur|budur)"),
  ),
  // R5b: «namazın/orucun/abdestin/nikahın» في التركية مضاف إليه غالباً («Namazın şartları»: شروط الصلاة)
  // لا «صلاتك»، و«… geçerli olması için» شرط عام لا حكم على حالة: لا يُعدّان فتوى شخصية.
  ...V(
    "tr",
    w(
      "(?:nikahınız|namazınız|orucunuz|abdestiniz)\\s+(?:geçerli|geçersiz|bozuldu|bozulmuştur|sahih|batıl|kabul)\\p{L}*(?!\\s+(?:olması|olabilmesi|sayılması|için))",
    ),
    w("fetvam"),
  ),
  ...P("ruling", "tr", w("(?:geçerli|geçersiz)\\s+(?:olur|değildir|sayılır|sayılmaz)|bozar|bozulur")),
  ...P("tarjih", "tr", w("(?:en\\s+)?(?:doğru|sahih|tercih\\s+edilen|r[aâ]cih|güçlü)\\s+görüş")),

  // Français
  ...P(
    "ruling",
    "fr",
    w("(?:est|sont|c'est|n'est|ce\\s+n'est)\\s+(?:pas\\s+)?(?:permis|interdit|illicite|licite|autorisé|prohibé|haram|halal)"),
    w("illicite|licite"),
    w(`(?:vous|tu)\\s+(?:devez|dois|êtes\\s+obligée?s?\\s+de|es\\s+obligée?\\s+de)(?!\\s+(?:consulter|demander|contacter|vous\\s+adresser|t'adresser|envoyer|poser|préciser))`),
    w("(?:le\\s+)?(?:divorce|talaq)\\s+(?:a\\s+eu\\s+lieu|est\\s+(?:valide|effectif|tombé|prononcé|valable))"),
    w("(?:c'est|ce\\s+n'est\\s+pas)\\s+un\\s+péché"),
  ),
  ...V("fr", w("(?:votre|ton|ta|vos|tes)\\s+(?:prière|jeûne|mariage|divorce|ablutions?|hajj|contrat|nikah)\\s+(?:est|sont|n'est)\\s+(?:pas\\s+)?(?:valide|invalide|nul|nulle|annulée?|accepté|rompu|valable)")),
  ...P("tarjih", "fr", w("l'avis\\s+(?:le\\s+plus\\s+)?(?:correct|juste|fort|prépondérant)\\s+est")),

  // اردو
  ...P(
    "ruling",
    "ur",
    ar("(?:نا)?جائز"),
    ar("مکروہ|مباح"),
    ar("طلاق\\s+(?:ہو\\s*گئی|ہوگئی|واقع\\s+ہو|پڑ\\s*گئی|ہو\\s*چکی|نہیں\\s+ہوئی)"),
    ar("(?:آپ|تم)\\s+(?:کو|پر)\\s+(?!کسی\\s+(?:عالم|ماہر|مفتی))[^۔.!?؟]{0,30}(?:چاہیے|لازم\\s+ہے|واجب\\s+ہے)"),
    ar("(?:نماز|روزہ)\\s+(?:ہو\\s*گئی|ہوگئی|ٹوٹ\\s*گیا|نہیں\\s+ٹوٹا|فاسد\\s+ہو)"),
  ),

  ...V("ur", ar("(?:آپ\\s+کی|تمہاری|تیری)\\s+(?:نماز|روزہ|نکاح|طلاق|توبہ)\\s+(?:ہو\\s*گئی|ہوگئی|درست|صحیح|باطل|فاسد|ٹوٹ\\s*گیا|نہیں\\s+ہوئی|قبول)")),

  // Bahasa Indonesia
  ...P(
    "ruling",
    "id",
    w("tidak\\s+boleh|(?:di)?(?:per)?bolehkan|dihalalkan|diharamkan"),
    w("hukumnya\\s+\\p{L}+"),
    w("(?:anda|kamu|engkau)\\s+(?:harus|wajib|perlu)(?!\\s+(?:bertanya|menghubungi|berkonsultasi|mengirim|menanyakan))"),
    w("talak(?:nya)?\\s+(?:sudah\\s+)?(?:jatuh|sah|tidak\\s+jatuh|berlaku)"),
    w("berdosa|dosa\\s+bagi"),
  ),
  ...V("id", w("(?:shalat|salat|puasa|pernikahan|nikah|wudhu|wudu)(?:mu|\\s+anda|\\s+kamu)\\s+(?:sah|tidak\\s+sah|batal)")),
  ...P("tarjih", "id", w("pendapat\\s+(?:yang\\s+)?(?:paling\\s+)?(?:kuat|rajih|benar)\\s+(?:adalah|ialah)")),
];

/** نسبة حديث في صياغة الأداة: يجب أن يتبعها اقتباس موثَّق (⟦Q⟧) قريباً. */
const HADITH_ATTRIBUTION: RegExp[] = [
  /(?:قال|يقول|وقال|فقال|روى|يروى|ورد\s+عن|جاء\s+عن|عن)\s+(?:رسول\s+الله|النبي|نبينا|الرسول)/u,
  /\b(?:the\s+)?(?:prophet|messenger\s+of\s+allah|messenger\s+of\s+god)\b[^.⟦]{0,30}\b(?:said|says|narrated|reported|stated)\b/iu,
  /\b(?:peygamber(?:imiz)?|resulullah|hz\.\s*muhammed)\b[^.⟦]{0,40}(?:buyurdu|buyurmuştur|dedi|demiştir)/iu,
  /\ble\s+prophète\b[^.⟦]{0,30}\b(?:a\s+dit|dit|disait|a\s+déclaré)/iu,
  /(?:نبی|رسول\s+اللہ|حضور)[^۔⟦]{0,40}(?:نے\s+فرمایا|فرماتے\s+ہیں|کا\s+ارشاد)/u,
  /\b(?:nabi|rasulullah|rasul)\b[^.⟦]{0,30}\b(?:bersabda|bersabda:|berkata)/iu,
];

const MODEL_LEAK =
  /(?<![\p{L}])(?:chat\s*gpt|gpt[-\s]?\d|openai|open\s*ai|gemini|gemma|bard|claude|anthropic|llama|meta\s+ai|qwen|alibaba|mistral|deepseek|grok|xiaomi|mimo|openrouter|google|شات\s*جي\s*بي\s*تي|جي\s*بي\s*تي|جيميني|جيمني|جيما|جوجل|غوغل|قوقل|كلود|أنثروبيك|لاما|كوين|ميسترال|ديب\s*سيك)(?![\p{L}])/iu;

// ---------------------------------------------------------------------------
// الفحص
// ---------------------------------------------------------------------------

/**
 * أسماء أعلام فيها «الحرام» أو «Haram» وليست حكماً: تُستبدل قبل فحص عبارات الحكم.
 * (مثال الخطأ: «وحج بيت الله الحرام» في جواب أركان الإسلام اعتُرض بوصفه حكماً.)
 */
const PROPER_NOUNS: RegExp[] = [
  // العربية والأردية (مع سوابق و ف ب ل ك): المسجد الحرام، بيت الله الحرام، البيت الحرام، الشهر الحرام،
  // الأشهر الحرم، البلد الحرام، المشعر الحرام، مسجد حرام.
  new RegExp(
    `${B}(?:[وفبلك])?(?:ال)?(?:مسجد|بيت(?:\\s+الله)?|شهر|اشهر|أشهر|بلد|مشعر)(?:ِ)?\\s+(?:ال)?(?:حرام|حرم)${E}`,
    "gu",
  ),
  // English / Français / Türkçe / Bahasa Indonesia
  /(?<![\p{L}])(?:(?:al|el)[-\s])?masjid(?:[-\s]?(?:al|el|il|ul))?[-\s]?haram(?![\p{L}])/giu,
  /(?<![\p{L}])masjidil\s?haram(?![\p{L}])/giu,
  /(?<![\p{L}])(?:the\s+)?(?:sacred|holy|haram)\s+(?:mosque|house|months?|precincts?|sanctuary)(?![\p{L}])/giu,
  /(?<![\p{L}])(?:la\s+)?(?:mosquée|maison)\s+sacrée(?![\p{L}])|(?<![\p{L}])mois\s+sacrés?(?![\p{L}])/giu,
  /(?<![\p{L}])mescid-?i\s?haram(?![\p{L}])|(?<![\p{L}])haram\s+aylar(?:ı)?(?![\p{L}])/giu,
];

export function maskProperNouns(text: string): string {
  return PROPER_NOUNS.reduce((t, re) => t.replace(re, " ⟦P⟧ "), text);
}

/** يفحص صياغة الأداة (بعد إخراج المقتبس الموثَّق). */
export function scanOwnText(ownText: string): GuardFinding[] {
  const text = maskProperNouns(stripMarks(ownText));
  const findings: GuardFinding[] = [];
  for (const p of PATTERNS) {
    const m = text.match(p.re);
    if (m) findings.push({ reason: p.reason, lang: p.lang, match: m[0].trim(), ...(p.verdict ? { verdict: true } : {}) });
  }
  const leak = text.match(MODEL_LEAK);
  if (leak) findings.push({ reason: "identity_leak", lang: "*", match: leak[0] });
  for (const re of HADITH_ATTRIBUTION) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    for (const m of text.matchAll(g)) {
      const after = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 60);
      const wide = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 300);
      const translated = TRANSLATION_MARKER.test(wide) && /\[\s*\d{1,2}\s*\]/.test(wide);
      if (!after.includes("⟦Q⟧") && !translated) {
        findings.push({ reason: "unsourced_quote", lang: "*", match: m[0].trim() });
        break;
      }
    }
  }
  return findings;
}

/** الفحص الكامل بلا استبدال. */
export function checkOutput(text: string, ctx: GuardContext = {}): { findings: GuardFinding[]; ownText: string } {
  const { ownText, unverified } = separateQuoted(text, ctx);
  const findings = scanOwnText(ownText);
  for (const q of unverified) findings.push({ reason: "unsourced_quote", lang: "*", match: q.slice(0, 120) });
  return { findings, ownText };
}

/** الرد الثابت المناسب لنوع المخالفة. */
export function replacementFor(findings: GuardFinding[], lang?: string): string {
  const reasons = new Set(findings.map((f) => f.reason));
  if (reasons.has("ruling") || reasons.has("tarjih") || reasons.has("offensive")) return message("refusal", lang);
  if (reasons.has("unsourced_quote")) return `${message("abstain", lang)} ${message("suggestExpert", lang)}`;
  return message("identityWho", lang);
}

/** الحارس: يعيد النص كما هو إن سلم، وإلا الرد الثابت. */
export function guard(text: string, ctx: GuardContext = {}): GuardResult {
  const { findings, ownText } = checkOutput(text, ctx);
  if (!findings.length) return { ok: true, text, original: text, findings, ownText };
  return { ok: false, text: replacementFor(findings, ctx.lang), original: text, findings, ownText };
}

/** الحارس مع التسجيل في guard_log عند الاكتشاف (على الخادم فقط). */
export async function guardAndLog(text: string, ctx: GuardContext & { caseId?: string | null } = {}): Promise<GuardResult> {
  const result = guard(text, ctx);
  if (!result.ok) {
    const { logGuard } = await import("./guard-log");
    await logGuard(result, ctx.caseId ?? null);
  }
  return result;
}


// ---------------------------------------------------------------------------
// حارس الجواب (R5c): يُعدِّل ولا يبتر
// ---------------------------------------------------------------------------
//
// الجواب يكتبه مساعد مسلم بعلمه بحرية كاملة، والمصادر المسترجعة تقوّيه بإشارات [n] حيث تنطبق.
// وجود المصدر شرف للجواب لا شرط لكل جملة، فلا تُحذف جملة لغياب رقم أبداً. يتدخل الحارس في:
//   1) نص منسوب بين علامات اقتباس (آية ﴿…﴾، أو حديث، أو قول عالم) غير مطابق لمصدر مسترجع:
//      يُصحَّح إلى نص المصدر إن قاربه (closestSpan)، وإلا تُحذف العلامات والنسبة ويبقى المعنى بصيغة
//      «ورد في السنة ما معناه:» (ومثلها للقرآن ولأهل العلم)، بلا «رواه…» ولا رقم حديث مختلق.
//      والاقتباس غير المنسوب (ذكر يُقال، دعاء، عبارة) يمر كما هو.
//   2) فتوى شخصية لحالة فردية (verdict): تمنع الجواب كله (إعادة، ثم الرد الثابت والإحالة).
//   3) اسم نموذج لغوي أو شركة، أو محتوى مسيء: تُحذف جملته وحدها.
// ولا يُعرض جواب أقصر من 40% من الجواب المولّد (MIN_KEEP_RATIO، respond.ts).

/** حدود الجملة خارج علامات الاقتباس. */
const UNIT_END = new Set([".", "!", "؟", "?", "۔", "\n"]);
const OPENERS: Record<string, string> = { "«": "»", "﴿": "﴾", "“": "”" };
const CLOSERS = new Set(Object.values(OPENERS));
const CITE_RUN = /^[ \t]*(?:\[\s*\d{1,2}\s*\][ \t]*)+/;

/**
 * يقسّم النص إلى جمل بحروفها (مجموعها = النص كله): لا يُقسم داخل «» ﴿﴾ “” ""، وإشارات [n]
 * التي تلي نهاية الجملة مباشرة تُلحق بها.
 */
export function splitUnits(text: string): string[] {
  const units: string[] = [];
  let depth = 0;
  let dquote = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (OPENERS[ch]) depth++;
    else if (CLOSERS.has(ch)) depth = Math.max(0, depth - 1);
    else if (ch === '"') dquote = !dquote;
    else if (ch === "\n") {
      depth = 0; // اقتباس لم يُغلق لا يبتلع ما بعد السطر
      dquote = false;
    }
    if (depth || dquote || !UNIT_END.has(ch)) continue;
    let end = i + 1;
    const cites = text.slice(end).match(CITE_RUN);
    if (cites) end += cites[0].length;
    units.push(text.slice(start, end));
    start = end;
    i = end - 1;
  }
  if (start < text.length) units.push(text.slice(start));
  return units;
}

/** أقل نسبة من طول الجواب المولّد يجوز عرضها: لا يُعرض جواب أقصر من 40% منه أبداً (R5c). */
export const MIN_KEEP_RATIO = 0.4;

/** هل صار الجواب بعد التعديل أقصر من 40% من المولّد؟ */
export function isTruncated(generated: string, shown: string): boolean {
  const g = generated.trim().length;
  return g > 0 && shown.trim().length < MIN_KEEP_RATIO * g;
}

/** عبارات الفتوى الشخصية وحدها (الحكم على حالة السائل نفسه). */
const VERDICT_PATTERNS = PATTERNS.filter((p) => p.verdict);

/** المحتوى المسيء: شتم موجَّه، أو وصف أتباع دين بألفاظ مهينة، أو ألفاظ بذيئة. */
const OFFENSIVE: RegExp[] = [
  new RegExp(`${B}يا\\s+(?:حمار|غبي|حقير|أحمق|احمق|كلب|خنزير|جاهل|تافه)${E}`, "u"),
  new RegExp(
    `${B}(?:ال)?(?:نصارى|يهود|مسيحيين|مسيحيون|هندوس|ملحدين|ملحدون|كفار|بوذيين)\\s+(?:أنجاس|انجاس|كلاب|خنازير|قذرون|حثالة|أغبياء|اغبياء|حمير)${E}`,
    "u",
  ),
  w("fuck\\p{L}*|shit|bitch|bastard|whore|retard(?:ed)?"),
  w("you(?:'re|\\s+are)?\\s+(?:an?\\s+)?(?:idiot|moron|stupid|fool)"),
  w("(?:christians|jews|hindus|atheists|disbelievers|kuffar)\\s+are\\s+(?:filthy|dogs|pigs|scum|stupid|idiots)"),
  w("aptal|salak|gerizekalı|şerefsiz|orospu"),
];

export type QuoteKind = "quran" | "hadith" | "scholar";

/** نسبة النص قبل الاقتباس: إلى الله تعالى (آية)، أو إلى النبي ﷺ (حديث)، أو إلى عالم. */
const ATTRIBUTION: Record<QuoteKind, RegExp[]> = {
  quran: [
    /(?:قال|يقول|وقال|فقال)\s+(?:الله\s+)?(?:تعالى|سبحانه|عز\s+وجل|جل\s+(?:وعلا|جلاله))/u,
    /(?:قال|يقول|وقال|فقال)\s+الله/u,
    /قوله\s+تعالى|(?:في\s+)?(?:ال)?قرآن(?:\s+الكريم)?\s*[:：]|(?:في\s+)?(?:ال)?آي[ةه](?:\s+الكريم[ةه])?\s*[:：]/u,
    /(?<![\p{L}])allah\s+(?:the\s+exalted\s+)?(?:says|said|tells\s+us|states)(?![\p{L}])|(?<![\p{L}])the\s+(?:holy\s+)?qur'?an\s+(?:says|states)(?![\p{L}])/iu,
    /(?<![\p{L}])allah\s+(?:teâlâ|teala)?[^"“«\n]{0,30}(?:buyurur|buyurmuştur|buyuruyor)/iu,
    /(?<![\p{L}])allah\s+dit|le\s+coran\s+dit/iu,
    /اللہ\s+تعالیٰ[^۔"«\n]{0,30}(?:فرماتا|فرمایا|ارشاد)/u,
    /(?<![\p{L}])allah\s+(?:swt\s+)?berfirman(?![\p{L}])/iu,
  ],
  hadith: [
    /(?:قال|يقول|وقال|فقال|كان\s+يقول)\s+(?:رسول\s+الله|النبي|نبينا|الرسول|ﷺ)/u,
    /(?:رسول\s+الله|النبي)\s+(?:ﷺ\s+)?(?:قال|يقول)/u,
    /(?:روى|يروى|ورد\s+عن|جاء\s+عن)\s+(?:رسول\s+الله|النبي)/u,
    /(?:في|جاء\s+في|ورد\s+في)\s+(?:ال)?حديث/u,
    /(?<![\p{L}])(?:the\s+)?(?:prophet|messenger\s+of\s+(?:allah|god))(?![\p{L}])[^"“«\n]{0,40}(?<![\p{L}])(?:said|says|stated|taught)(?![\p{L}])/iu,
    /(?<![\p{L}])(?:in\s+(?:a|the)\s+hadith|a\s+hadith\s+(?:says|states))(?![\p{L}])/iu,
    /(?<![\p{L}])(?:peygamber(?:imiz)?|resulullah|hz\.\s*muhammed)[^"“«\n]{0,40}(?:buyurdu|buyurmuştur|buyurur|dedi|demiştir)/iu,
    /(?<![\p{L}])hadis(?:-i\s+şerif)?te(?![\p{L}])/iu,
    /(?<![\p{L}])le\s+prophète[^"“«\n]{0,40}(?:a\s+dit|dit|disait|a\s+déclaré)|dans\s+un\s+hadith/iu,
    /(?:نبی|رسول\s+اللہ|حضور)[^۔"«\n]{0,40}(?:نے\s+فرمایا|فرماتے\s+ہیں|کا\s+ارشاد)/u,
    /(?<![\p{L}])(?:nabi|rasulullah|rasul)(?![\p{L}])[^"“«\n]{0,30}(?:bersabda|berkata)/iu,
  ],
  scholar: [
    /(?:قال|يقول|وقال|ذكر|نص|قرر)\s+(?:ال)?(?:إمام|امام|شيخ|علام[ةه]|حافظ|فقهاء|علماء|أهل\s+العلم|اهل\s+العلم|ابن\s+\p{L}+|نووي)/u,
    /(?<![\p{L}])(?:imam|shaykh|sheikh|shaikh|scholars?|ibn\s+\p{L}+)(?![\p{L}])[^"“«\n]{0,30}(?<![\p{L}])(?:said|says|wrote|stated)(?![\p{L}])/iu,
    /(?<![\p{L}])(?:imam|âlim(?:ler)?|alim(?:ler)?|şeyh)(?![\p{L}])[^"“«\n]{0,30}(?:demiştir|dedi|der|söyler)/iu,
    /(?<![\p{L}])(?:l'imam|le\s+savant|les\s+savants|cheikh)(?![\p{L}])[^"“«\n]{0,30}(?:a\s+dit|dit|disent)/iu,
    /(?<![\p{L}])(?:imam|syaikh|ulama)(?![\p{L}])[^"“«\n]{0,30}(?:berkata|mengatakan)/iu,
  ],
};

/** عزو بعد الاقتباس («رواه البخاري»، «متفق عليه»، "narrated by…"): يجعله حديثاً منسوباً. */
const REF_AFTER =
  /^((?:\s*\[\s*\d{1,2}\s*\])*)\s*[(（]?\s*(?:رواه|أخرجه|متفق\s+عليه|narrated\s+by|reported\s+by|recorded\s+by|(?:sahih\s+)?(?:al-)?bukhari|sahih\s+muslim)[^.()\n[\]؟?!]{0,60}(?:[(（][^()\n]{0,20}[)）])?\s*[)）]?/iu;

/** نسبة حديث بلا اقتباس («قال رسول الله ﷺ إن…»): تُليَّن إن لم يتبعها نص ولا إشارة [n]. */
const BARE_HADITH: RegExp[] = [
  /(?:و|ف)?(?:قال|يقول)\s+(?:رسول\s+الله|النبي|نبينا|الرسول)(?:\s*(?:ﷺ|صلى\s+الله\s+عليه\s+وسلم|عليه\s+الصلاة\s+والسلام))?\s*[:：]?/gu,
  /(?<![\p{L}])(?:the\s+)?(?:prophet|messenger\s+of\s+(?:allah|god))(?:\s*(?:ﷺ|\(pbuh\)|\(saw\)|\(s\.a\.w\.?\)|,?\s*peace\s+be\s+upon\s+him,?))?\s+(?:said|says)(?:\s+that)?\s*[:,]?/giu,
];

const PREFIX: Record<QuoteKind, "quranMeaning" | "sunnahMeaning" | "scholarMeaning"> = {
  quran: "quranMeaning",
  hadith: "sunnahMeaning",
  scholar: "scholarMeaning",
};

/**
 * بداية نافذة النسبة قبل الاقتباس: لا تتجاوز نهاية الجملة السابقة ولا اقتباساً سابقاً. السطر
 * الجديد بعد «:» لا يقطعها («قال ﷺ:» ثم الحديث في السطر التالي).
 */
function windowStart(text: string, start: number): number {
  const from = Math.max(0, start - 100);
  for (let i = start - 1; i >= from; i--) {
    const ch = text[i];
    if ("»﴾”\"".includes(ch)) return i + 1;
    if (".!?؟۔".includes(ch) && /\s/.test(text[i + 1] ?? "")) return i + 1;
    if (ch === "\n" && !/[:：]\s*$/.test(text.slice(from, i))) return i + 1;
  }
  return from;
}

/** نوع النسبة وموضع بدايتها (يُحذف من بدايتها إلى علامة الاقتباس)، أو null للاقتباس غير المنسوب. */
function attributionOf(text: string, q: Quote): { kind: QuoteKind; at: number } | null {
  const from = windowStart(text, q.start);
  const win = text.slice(from, q.start);
  let best: { kind: QuoteKind; at: number } | null = null;
  for (const kind of ["quran", "hadith", "scholar"] as QuoteKind[]) {
    for (const re of ATTRIBUTION[kind]) {
      const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      for (const m of win.matchAll(g)) {
        const at = from + (m.index ?? 0);
        if (!best || at > best.at) best = { kind, at };
      }
    }
  }
  const opener = text[q.start];
  if (opener === "﴿") return { kind: "quran", at: best?.kind === "quran" ? best.at : q.start };
  if (best) return best;
  if (REF_AFTER.test(text.slice(q.end, q.end + 80))) return { kind: "hadith", at: q.start };
  return null;
}

export type AnswerFix = {
  kind: "quote_fixed" | "quote_softened" | "attribution_softened" | "sentence_removed";
  reason: GuardReason;
  match: string;
};

export type AnswerRepair = {
  /** الجواب بعد التعديل. */
  text: string;
  fixes: AnswerFix[];
  /** فتوى شخصية: تمنع الجواب كله (إعادة، ثم الرد الثابت والإحالة). */
  blocked: GuardFinding[];
};

/**
 * أقرب مقطع حرفي في النصوص لاقتباس غير مطابق (نسخة النموذج من آية أو حديث فيها كلمة زائدة أو
 * ناقصة): نافذة بطول الاقتباس ±2 كلمة، تُقبل إن بلغ التطابق بالترتيب 75%. null إن لم يوجد.
 */
export function closestSpan(inner: string, sources: string[]): string | null {
  const q = stripMarks(inner)
    .split(/\s+/)
    .map(matchKey)
    .filter(Boolean);
  if (q.length < 4) return null;
  const qSet = new Set(q);
  let best: { ratio: number; text: string } | null = null;
  for (const source of sources) {
    const tokens = source.split(/\s+/).filter(Boolean);
    const keys = tokens.map(matchKey);
    const covered = q.filter((w) => keys.includes(w)).length / q.length;
    if (covered < 0.6) continue;
    for (let i = 0; i < keys.length; i++) {
      if (!qSet.has(keys[i])) continue;
      for (let len = Math.max(4, q.length - 2); len <= q.length + 2 && i + len <= keys.length; len++) {
        const ratio = lcs(q, keys.slice(i, i + len)) / Math.max(q.length, len);
        if (ratio >= 0.75 && (!best || ratio > best.ratio)) {
          best = { ratio, text: tokens.slice(i, i + len).join(" ") };
        }
      }
    }
  }
  if (!best) return null;
  const text = best.text.replace(/[«»﴿﴾“”"]/g, "").replace(/^[\s،,.:؛]+|[\s،,:؛]+$/g, "").trim();
  return text && isVerbatim(text, sources) ? text : null;
}

type Edit = { from: number; to: number; text: string };

function applyEdits(text: string, edits: Edit[]): string {
  return [...edits].sort((a, b) => b.from - a.from).reduce((t, e) => t.slice(0, e.from) + e.text + t.slice(e.to), text);
}

/** 1) الاقتباسات المنسوبة: تصحيح إلى نص المصدر، أو تليين (بلا علامات ولا نسبة، والمعنى باقٍ). */
function repairQuotes(text: string, ctx: GuardContext, fixes: AnswerFix[]): string {
  const sources = [...(ctx.sources ?? []), ctx.question ?? ""].filter(Boolean);
  const known = [...sources, ...FIXED_TEXTS];
  const edits: Edit[] = [];
  for (const q of findQuotes(text)) {
    if (matchKey(q.inner).length < MIN_QUOTE_KEY || isExactVerbatim(q.inner, known)) continue;
    if (isMarkedTranslation(text, q.start, q.end)) continue;
    const attr = attributionOf(text, q);
    // المعنى بلغة السائل بجوار [n] صياغة لا اقتباس (R5b)، ما لم يُنسب إلى النبي ﷺ أو إلى عالم.
    if (isQuotedMeaning(text, q, ctx) && !attr) continue;
    const span = closestSpan(q.inner, sources);
    if (span) {
      const whole = text.slice(q.start, q.end);
      const at = whole.indexOf(q.inner);
      edits.push({ from: q.start, to: q.end, text: `${whole.slice(0, at)}${span}${whole.slice(at + q.inner.length)}` });
      fixes.push({ kind: "quote_fixed", reason: "unsourced_quote", match: q.inner.slice(0, 120) });
      continue;
    }
    // الاقتباس غير المنسوب (ذكر يُقال، دعاء، عبارة) يمر كما هو.
    if (!attr) continue;
    const ref = text.slice(q.end).match(REF_AFTER);
    const to = ref ? q.end + ref[0].length : q.end;
    if (edits.some((e) => attr.at < e.to && to > e.from)) continue;
    const cites = ref?.[1] ?? "";
    const prefix = message(PREFIX[attr.kind], ctx.lang ?? (/[؀-ۿ]/.test(q.inner) ? "ar" : "en"));
    const space = /\s$/.test(text.slice(q.end, to)) ? " " : "";
    edits.push({ from: attr.at, to, text: `${prefix} ${q.inner.trim()}${cites}${space}` });
    fixes.push({ kind: "quote_softened", reason: "unsourced_quote", match: q.inner.slice(0, 120) });
  }
  return applyEdits(text, edits);
}

/** نسبة حديث بلا اقتباس يتبعها ولا إشارة [n] في جملتها: «ورد في السنة ما معناه:». */
function softenBareAttributions(text: string, ctx: GuardContext, fixes: AnswerFix[]): string {
  const count = ctx.citeCount ?? ctx.sources?.length ?? 0;
  const edits: Edit[] = [];
  for (const re of BARE_HADITH) {
    for (const m of text.matchAll(re)) {
      const from = m.index ?? 0;
      const to = from + m[0].length;
      if (edits.some((e) => from < e.to && to > e.from)) continue;
      const after = text.slice(to);
      if (/^[\s:：]*[«﴿“"]/.test(after)) continue; // يتبعها نص منقول (فُحص في repairQuotes)
      const end = after.search(/[.!?؟۔\n]/);
      const rest = end === -1 ? after : after.slice(0, end + 1) + (after.slice(end + 1).match(CITE_RUN)?.[0] ?? "");
      if (citesIn(rest, count).length) continue; // مسنَدة إلى نص مسترجع
      const prefix = message("sunnahMeaning", ctx.lang ?? (/[؀-ۿ]/.test(m[0]) ? "ar" : "en"));
      edits.push({ from, to, text: `${prefix} ` });
      fixes.push({ kind: "attribution_softened", reason: "unsourced_quote", match: m[0].trim().slice(0, 120) });
    }
  }
  return applyEdits(text, edits).replace(/ {2,}/g, " ");
}

/** أرقام [n] الصحيحة في جملة. */
function citesIn(unit: string, count: number): number[] {
  return [...unit.matchAll(/\[\s*(\d{1,2})\s*\]/g)].map((m) => Number(m[1])).filter((n) => n >= 1 && n <= count);
}

/** مخالفات جملة واحدة: فتوى شخصية، أو اسم نموذج، أو محتوى مسيء (في صياغة الأداة وحدها). */
function unitFindings(unit: string, ctx: GuardContext): GuardFinding[] {
  const own = maskProperNouns(stripMarks(separateQuoted(unit, ctx).ownText));
  const findings: GuardFinding[] = [];
  for (const p of VERDICT_PATTERNS) {
    const m = own.match(p.re);
    if (m) findings.push({ reason: "ruling", lang: p.lang, match: m[0].trim(), verdict: true });
  }
  const leak = own.match(MODEL_LEAK);
  if (leak) findings.push({ reason: "identity_leak", lang: "*", match: leak[0] });
  for (const re of OFFENSIVE) {
    const m = own.match(re);
    if (m) {
      findings.push({ reason: "offensive", lang: "*", match: m[0].trim() });
      break;
    }
  }
  return findings;
}

/** الفتوى الشخصية وحدها تمنع الجواب كله؛ اسم النموذج والمسيء تُحذف جملتهما فقط. */
export function isBlocking(f: GuardFinding): boolean {
  return Boolean(f.verdict);
}

/**
 * حارس الجواب (R5c): يصحح الاقتباس المنسوب أو يليّنه، ويليّن نسبة الحديث بلا نص ولا إشارة،
 * ويحذف جملة اسم النموذج أو المسيء وحدها، ويعيد الفتوى الشخصية في blocked. لا يحذف شيئاً غير ذلك.
 */
export function repairAnswer(text: string, ctx: GuardContext = {}): AnswerRepair {
  const fixes: AnswerFix[] = [];
  const softened = softenBareAttributions(repairQuotes(text, ctx, fixes), ctx, fixes);
  const blocked: GuardFinding[] = [];
  const kept: string[] = [];
  let removed = false;
  for (const unit of splitUnits(softened)) {
    const findings = unitFindings(unit, ctx);
    blocked.push(...findings.filter(isBlocking));
    const drop = findings.find((f) => f.reason === "identity_leak" || f.reason === "offensive");
    if (!drop) {
      kept.push(unit);
      continue;
    }
    removed = true;
    fixes.push({ kind: "sentence_removed", reason: drop.reason, match: drop.match.slice(0, 120) });
    if (unit.endsWith("\n")) kept.push("\n"); // نهاية السطر تبقى (لا تلتصق الفقرات)
  }
  let out = kept.join("");
  if (removed) {
    out = out
      .split("\n")
      // سطر بقي فيه رقم خطوة أو علامة قائمة أو إشارة وحدها بعد حذف جملته.
      .filter((line) => !/^\s*(?:\d{1,2}[.)]|[-•*])?\s*(?:\[\s*\d{1,2}\s*\]\s*)*$/.test(line) || !line.trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n");
  }
  return { text: out.trim(), fixes, blocked };
}

/** فحص الجواب بلا تعديل: ما كان الحارس سيعدّله أو يمنعه (فارغ = يمر كما هو). */
export function checkAnswer(text: string, ctx: GuardContext = {}): { findings: GuardFinding[]; ownText: string } {
  const r = repairAnswer(text, ctx);
  const findings: GuardFinding[] = [
    ...r.blocked,
    ...r.fixes.filter((f) => f.kind !== "quote_fixed").map((f) => ({ reason: f.reason, lang: "*", match: `${f.kind}: ${f.match}` })),
  ];
  return { findings, ownText: separateQuoted(text, ctx).ownText };
}
