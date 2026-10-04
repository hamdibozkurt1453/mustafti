import { MESSAGES, message } from "./messages";

/**
 * الحارس: فحص بالكود (بلا نموذج) لكلام الأداة قبل أن يصل إلى السائل.
 *
 * 1) يفصل النص المنقول عن صياغة الأداة: كل مقطع بين علامات الاقتباس (« » ﴿ ﴾ “ ” " ")
 *    يُعدّ منقولاً **فقط إن وُجد حرفياً** (بعد توحيد التشكيل والهمزات) في النصوص المسترجعة
 *    أو في سؤال السائل. فلا يمكن تهريب حكم في علامات اقتباس.
 * 2) يفحص صياغة الأداة وحدها بست لغات (ar en tr fr ur id) عن:
 *    - ruling: عبارات الحكم (يجوز، حرام، وقع الطلاق، عليك أن، permissible, haram, caiz…)
 *    - tarjih: الترجيح بين الأقوال (الراجح، the stronger opinion…)
 *    - unsourced_quote: اقتباس أو نسبة حديث لا أصل لها في النصوص المسترجعة
 *    - identity_leak: اسم نموذج لغوي أو شركة ذكاء اصطناعي
 * 3) عند الاكتشاف: يستبدل الكلام كله برد ثابت (messages.ts)، ويُسجَّل في guard_log (guardAndLog).
 *
 * الملف نقي (بلا server-only) ليُختبر محلياً بلا نموذج: tests/brain.test.ts.
 */

export type GuardReason = "ruling" | "tarjih" | "unsourced_quote" | "identity_leak";

export type GuardFinding = { reason: GuardReason; lang: string; match: string };

export type GuardContext = {
  /** نصوص المصادر المسترجعة المرفقة بالتعليمات (ما يجوز اقتباسه). */
  sources?: string[];
  /** سؤال السائل (يجوز اقتباسه عند تصحيح تصوّر خاطئ أو آية منقولة بخطأ). */
  question?: string;
  /** لغة السائل، للرد الثابت. */
  lang?: string;
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
    } else if (isMarkedTranslation(text, q.start, q.end)) {
      // ترجمة معنى موسومة بجوار إشارة [n]: صياغة للأداة (تُفحص كلها)، لا اقتباس بلا أصل.
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

type Pattern = { reason: GuardReason; lang: string; re: RegExp };

const P = (reason: GuardReason, lang: string, ...res: RegExp[]): Pattern[] => res.map((re) => ({ reason, lang, re }));

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
    ar("[يت]حرم\\s+(?:عليك|عليكم|عليكما|عليكن)|محر[ّ]?م[ةه]?\\s+(?:عليك|عليكم|شرع)"),
    ar("[يت]حل\\s+لك|يحق\\s+لك"),
    ar("لا\\s+بأس"),
    ar("(?:وقع|يقع|تقع|وقعت|لم\\s+يقع|لا\\s+يقع)\\s+(?:ال)?(?:طلاق|طلقة|طلقتان)"),
    ar("طلاق(?:ك|ه|كم)?\\s+(?:واقع|وقع|صحيح|باطل|نافذ|لم\\s+يقع)"),
    ar("(?:يجب|يلزم|يتعين|يتعيّن|ينبغي|يُشترط|يشترط)\\s+عليك"),
    ar("يلزمك|يلزمكم"),
    ar(`عليك\\s+[أا]ن${AR_CONSULT}`),
    ar("عليك\\s+(?:الكفارة|كفارة|القضاء|قضاء|الإعادة|الاعادة|إعادة|اعادة|الصيام|صيام|الفدية|فدية|الغسل|غسل)"),
    ar(
      "(?:صلاتك|صومك|صيامك|زواجك|نكاحك|عقدك|حجك|عمرتك|وضوؤك|وضوءك|طهارتك|زكاتك|توبتك|صلاتكم|صيامكم)\\s+(?:صحيح[ةه]?|باطل[ةه]?|فاسد[ةه]?|مقبول[ةه]?|لا\\s+[يت]صح|[يت]صح)",
    ),
    ar("(?:حكمه|حكمها|الحكم)\\s+(?:هو\\s+)?(?:الجواز|التحريم|الحرمة|الوجوب|الكراهة|الإباحة|الاباحة|الاستحباب)"),
    ar("أفتيك|افتيك|فتواي"),
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
    w("you\\s+(?:may|can|are\\s+allowed\\s+to)\\s+(?:not\\s+)?(?:eat|drink|marry|pray|fast|take|keep|work|use|break|combine|skip|delay|divorce|celebrate|listen)"),
    w(
      "your\\s+(?:prayer|salah|salat|fast|fasting|marriage|nikah|divorce|contract|hajj|umrah|wudu|wudhu|ablution|zakat|repentance)\\s+(?:is|was)\\s+(?:not\\s+)?(?:valid|invalid|void|accepted|correct|broken|nullified|sound)",
    ),
    w("(?:the\\s+|your\\s+)?(?:divorce|talaq)\\s+(?:has\\s+)?(?:occurred|counts|took\\s+effect|is\\s+(?:valid|effective|binding|void)|did\\s+not\\s+(?:occur|count))"),
    w("the\\s+(?:islamic\\s+)?ruling\\s+(?:is|would\\s+be)|my\\s+fatwa|i\\s+rule\\s+that"),
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
    w("(?:nikahınız|nikahın|namazınız|namazın|orucunuz|orucun|abdestiniz|abdestin)\\s+(?:geçerli|geçersiz|bozuldu|bozulmuştur|sahih|batıl|kabul)\\p{L}*"),
    w("(?!(?:sor|danış|başvur|ilet|gönder|yaz)m)\\p{L}+(?:malı|meli)(?:sınız|siniz|sın|sin)"),
    w("hüküm\\s+(?:şudur|budur)|fetvam"),
  ),
  ...P("tarjih", "tr", w("(?:en\\s+)?(?:doğru|sahih|tercih\\s+edilen|r[aâ]cih|güçlü)\\s+görüş")),

  // Français
  ...P(
    "ruling",
    "fr",
    w("(?:est|sont|c'est|n'est|ce\\s+n'est)\\s+(?:pas\\s+)?(?:permis|interdit|illicite|licite|autorisé|prohibé|haram|halal)"),
    w("illicite|licite"),
    w(`(?:vous|tu)\\s+(?:devez|dois|êtes\\s+obligée?s?\\s+de|es\\s+obligée?\\s+de)(?!\\s+(?:consulter|demander|contacter|vous\\s+adresser|t'adresser|envoyer|poser|préciser))`),
    w("(?:votre|ton|ta|vos|tes)\\s+(?:prière|jeûne|mariage|divorce|ablutions?|hajj|contrat|nikah)\\s+(?:est|sont|n'est)\\s+(?:pas\\s+)?(?:valide|invalide|nul|nulle|annulée?|accepté|rompu|valable)"),
    w("(?:le\\s+)?(?:divorce|talaq)\\s+(?:a\\s+eu\\s+lieu|est\\s+(?:valide|effectif|tombé|prononcé|valable))"),
    w("(?:c'est|ce\\s+n'est\\s+pas)\\s+un\\s+péché"),
  ),
  ...P("tarjih", "fr", w("l'avis\\s+(?:le\\s+plus\\s+)?(?:correct|juste|fort|prépondérant)\\s+est")),

  // اردو
  ...P(
    "ruling",
    "ur",
    ar("(?:نا)?جائز"),
    ar("مکروہ|مباح"),
    ar("طلاق\\s+(?:ہو\\s*گئی|ہوگئی|واقع\\s+ہو|پڑ\\s*گئی|ہو\\s*چکی|نہیں\\s+ہوئی)"),
    ar("(?:آپ|تم)\\s+(?:کو|پر)\\s+(?!کسی\\s+(?:عالم|ماہر|مفتی))[^۔.!?؟]{0,30}(?:چاہیے|لازم\\s+ہے|واجب\\s+ہے)"),
    ar("(?:آپ\\s+کی|تمہاری|تیری)\\s+(?:نماز|روزہ|نکاح|طلاق|توبہ)\\s+(?:ہو\\s*گئی|ہوگئی|درست|صحیح|باطل|فاسد|ٹوٹ\\s*گیا|نہیں\\s+ہوئی|قبول)"),
    ar("(?:نماز|روزہ)\\s+(?:ہو\\s*گئی|ہوگئی|ٹوٹ\\s*گیا|نہیں\\s+ٹوٹا|فاسد\\s+ہو)"),
  ),

  // Bahasa Indonesia
  ...P(
    "ruling",
    "id",
    w("tidak\\s+boleh|(?:di)?(?:per)?bolehkan|dihalalkan|diharamkan"),
    w("hukumnya\\s+\\p{L}+"),
    w("(?:anda|kamu|engkau)\\s+(?:harus|wajib|perlu)(?!\\s+(?:bertanya|menghubungi|berkonsultasi|mengirim|menanyakan))"),
    w("talak(?:nya)?\\s+(?:sudah\\s+)?(?:jatuh|sah|tidak\\s+jatuh|berlaku)"),
    w("(?:shalat|salat|puasa|pernikahan|nikah|wudhu|wudu)(?:mu|\\s+anda|\\s+kamu)\\s+(?:sah|tidak\\s+sah|batal)"),
    w("berdosa|dosa\\s+bagi"),
  ),
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

/** يفحص صياغة الأداة (بعد إخراج المقتبس الموثَّق). */
export function scanOwnText(ownText: string): GuardFinding[] {
  const text = stripMarks(ownText);
  const findings: GuardFinding[] = [];
  for (const p of PATTERNS) {
    const m = text.match(p.re);
    if (m) findings.push({ reason: p.reason, lang: p.lang, match: m[0].trim() });
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
  if (reasons.has("ruling") || reasons.has("tarjih")) return message("refusal", lang);
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
