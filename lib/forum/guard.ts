/**
 * حارس «الحوار» (R4): منفصل عن حارس المحادثة (lib/brain/guard.ts) وأبسط منه، ونقي فيُختبر محلياً.
 *
 * يمر عليه كل موضوع أو رد من غير مختص مقبول قبل النشر، ويرفض خمسة أشياء فقط:
 *   insult     السبّ والشتم الموجّه
 *   takfir     تكفير المشاركين أو غيرهم («أنت كافر»، «يا مرتد»)
 *   incitement التحريض على القتل أو الأذى
 *   ads        الإعلانات (عبارات البيع، وأرقام الهواتف، والمراسلة خارج المنصة)
 *   link       الروابط من خارج مواقع المرجعية (ومنها المختصرة)
 * ولا يرفض غير ذلك: النقاش والسؤال والاختلاف المؤدب كلها تُنشر.
 *
 * وإن وجد حكماً شرعياً جازماً من غير مختص («هذا حرام قطعاً»، «يجوز لك…») يُنشر النص
 * مع تنبيه ظاهر (rulingNotice): «هذا رأي مشارك وليس فتوى».
 * لا يولّد الحارس نصاً، ولا تُنشر في المنتدى إجابات مولّدة آلياً أبداً.
 */

import { WEB_ALLOWED_DOMAINS } from "@/lib/sources/registry";

export type ForumRejection = "insult" | "takfir" | "incitement" | "ads" | "link";
export type ForumVerdict = { ok: true; rulingNotice: boolean } | { ok: false; reason: ForumRejection };

/** نطاقات الروابط المسموحة: مواقع المرجعية، ومُستفتي نفسه. */
export const FORUM_LINK_DOMAINS: readonly string[] = ["mustafti.com", ...WEB_ALLOWED_DOMAINS];

/**
 * توحيد للمطابقة: أحرف صغيرة، بلا تشكيل ولا تطويل، والألف والياء والتاء المربوطة موحّدة،
 * والأرقام الهندية أرقام عادية. الأنماط أدناه مكتوبة بهذه الصورة الموحّدة.
 */
export function normalizeForum(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[ً-ٰٟۖ-ۭـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[’`]/g, "'");
}

// حدود الكلمة لأحرف عربية ولاتينية معاً (‎\b لا يعرف العربية).
const L = "(?<![\\p{L}\\p{N}])";
const R = "(?![\\p{L}\\p{N}])";
const word = (alts: string) => new RegExp(`${L}(?:${alts})${R}`, "iu");

// «أنت/أنتم…» بالعربية (موحّدة) والأردية والفارسية.
const YOU_AR = "انت|انتم|انتي|انتن|يا";

const INSULT: RegExp[] = [
  // العربية: شتم موجّه أو بذيء صريح. («خنزير» وحدها لا: «لحم الخنزير» نقاش فقهي.)
  word(`(?:${YOU_AR})\\s+(?:حمار|حمير|كلب|كلاب|غبي|اغبياء|حقير|حقراء|تافه|خنزير|خنازير|حيوان|زباله|وسخ|منحط|جاهل|جهله|سافل|قذر|واطي|معفن|نذل|ساقط|ساقطه|منافق|كذاب|دجال)`),
  word("ابن\\s+(?:الكلب|كلب|الحرام|حرام|العاهره|الزانيه)|بنت\\s+(?:الكلب|الحرام)|ولد\\s+(?:الكلب|الحرام)"),
  word("(?:الله\\s+)?يلعنك|لعنه\\s+الله\\s+عليك|لعنك\\s+الله|لعنكم\\s+الله|تفو\\s+عليك|اخرس|انقلع|يلعن\\s+(?:ابوك|امك|دينك|اباك)"),
  word("شرموط\\S*|قحبه|منيوك|كس\\s*امك|طيز|متناك"),
  // الإنجليزية
  word("fuck\\S*|f\\*+k|shit(?:ty)?|bitch\\S*|bastard\\S*|asshole\\S*|dickhead|motherfucker|cunt|whore|slut|retard(?:ed)?|moron\\S*|scumbag"),
  word("(?:you(?:'re| are)?|ur|u r)\\s+(?:an?\\s+)?(?:idiot|stupid|dumb|pig|dog|donkey|liar|hypocrite|loser|fool|ignorant)"),
  word("go\\s+to\\s+hell|shut\\s+up|damn\\s+you|curse\\s+you"),
  // التركية، والفرنسية، والإندونيسية/الملايوية، والروسية، والأردية/الفارسية، والسواحيلية، والهوسا، والبنغالية
  word("orospu\\S*|siktir\\S*|amına|piç|aptal\\s*sın|gerizekalı\\S*|şerefsiz\\S*"),
  word("connard\\S*|salope|putain|ta\\s+gueule|enculé\\S*|fils\\s+de\\s+pute|imbécile|crétin"),
  word("bangsat|goblok|tolol|kampret|bajingan|babi\\s+(?:kau|lu|kamu)|(?:kau|lu|kamu)\\s+(?:bodoh|babi|anjing)"),
  word("сука|бля\\S*|мудак\\S*|идиот\\S*|урод\\S*|дебил\\S*|пошёл\\s+на|пошел\\s+на|хуй\\S*|пизд\\S*"),
  word("حرامی|حرامزاده|حرومزاده|کمینے|کمینه|کتے|خنزیر\\s+(?:ہو|هستی)|احمق\\s+(?:ہو|هستی)|کثافت|الو\\s+کے\\s+پٹھے|بے\\s*غیرت|بی\\s*شرف"),
  word("mjinga|mpumbavu|malaya|shenzi|kumamako|wawa|dan\\s+iska|shege|mara\\s+kunya"),
  word("শুয়োর|কুত্তা|হারামজাদা|বেজন্মা|গাধা"),
];

const TAKFIR: RegExp[] = [
  // العربية: الحكم بالكفر على المخاطب أو على أشخاص بأعيانهم («ما حكم التكفير؟» نقاش يُنشر).
  word(`(?:${YOU_AR})\\s+(?:كافر|كافره|كفار|كافرون|كافرين|مرتد|مرتده|مرتدون|مرتدين|مشرك|مشركه|مشركون|مشركين|زنديق|زنادقه|خارج\\s+(?:عن|من)\\s+المله|لست\\s+مسلما?|لستم\\s+مسلمين)`),
  word("(?:هولاء|هؤلاء|هذا\\s+الشيخ|هذا\\s+الرجل|هذا\\s+الشخص|صاحب\\s+(?:هذا\\s+)?(?:الموضوع|المنشور|الرد))\\s+(?:كافر|كفار|مرتد|مرتدون|مشركون|مشرك|زنادقه|زنديق)"),
  word("(?:كفرك|كفركم|نكفرك|نكفركم|اكفرك|اكفركم)|(?:انت|انتم)\\s+(?:قد\\s+)?كفرت(?:م)?|(?:خرجت|خرجتم)\\s+من\\s+(?:المله|الاسلام|الدين)"),
  // الإنجليزية
  word("(?:you(?:'re| are)?|you\\s+all\\s+are|ur|u r)\\s+(?:an?\\s+)?(?:kafir|kaafir|kuffar|kafirs|disbeliever|disbelievers|apostate|apostates|infidel|infidels|murtad|mushrik|not\\s+(?:a\\s+)?muslims?)"),
  word("(?:this\\s+(?:guy|man|person|sheikh)|these\\s+people|the\\s+op)\\s+(?:is|are)\\s+(?:an?\\s+)?(?:kafir|kaafir|kuffar|apostates?|infidels?|murtad)"),
  word("you\\s+(?:have\\s+)?(?:left|exited)\\s+(?:the\\s+fold\\s+of\\s+)?islam"),
  // التركية، والفرنسية، والإندونيسية/الملايوية، والأردية، والفارسية، والروسية، والسواحيلية، والهوسا، والبنغالية
  word("kafirsin(?:iz)?|sen\\s+kafirsin|siz\\s+kafirsiniz|mürtedsin|dinden\\s+çıktın"),
  word("tu\\s+es\\s+(?:un\\s+|une\\s+)?(?:kafir|kâfir|mécréant\\S*|apostat\\S*|infidèle)|vous\\s+êtes\\s+(?:des\\s+)?(?:kafirs?|mécréants|apostats)"),
  word("(?:kamu|kau|lu|anda|awak|engkau|dasar)\\s+(?:kafir|murtad|musyrik)"),
  word("(?:تم|تو|آپ|شما)\\s+(?:کافر|مرتد|مشرک)"),
  word("ты\\s+(?:кафир|неверн\\S*|вероотступник)|вы\\s+(?:кафиры|неверные)"),
  word("wewe\\s+ni\\s+(?:kafiri|mkafiri|murtadi)|kai\\s+kafiri\\s+ne|kai\\s+kafiri"),
  word("তুমি\\s+কাফের|তুই\\s+কাফের|আপনি\\s+কাফের"),
];

const INCITEMENT: RegExp[] = [
  word("اقتلوا|اقتلوه|اقتلوهم|اقتلوها|اقتله|اقتلهم|اذبحوا|اذبحوه|اذبحوهم|اذبحه|فجروا|فجروه|فجروهم|احرقوا|احرقوه|احرقوهم|اسحلوه|اسحلوهم|اضربوه|اضربوهم|اقطعوا\\s+راسه|اهدروا\\s+دمه|اهدروا\\s+دمهم"),
  word("(?:يجب|وجب|لابد\\s+من|لا\\s+بد\\s+من|لازم|ينبغي)\\s+(?:قتل|ذبح|تصفيه|حرق|تفجير|سحل|اغتيال|ضرب)\\s*(?:هم|ه|ها|هؤلاء|هولاء|كل|هذا|هذه|ال)"),
  word("دمه\\s+(?:حلال|مباح|مهدور)|دمهم\\s+(?:حلال|مباح|مهدور)|دماوهم\\s+(?:حلال|مباحه)"),
  word("kill\\s+(?:them|him|her|all|every|these|those|the\\s+\\S+)|(?:should|must|deserve\\s+to|needs?\\s+to)\\s+be\\s+(?:killed|executed|beheaded|burned|slaughtered)|death\\s+to|behead\\s+(?:them|him|her)|bomb\\s+(?:them|their|the)|burn\\s+(?:them|him|her|their)"),
  word("öldürün|öldürmek\\s+lazım|kafasını\\s+kesin"),
  word("tuez[- ](?:les|le|la)|il\\s+faut\\s+(?:les|le|la)\\s+tuer|mort\\s+aux"),
  word("bunuh\\s+(?:mereka|dia|semua)|bakar\\s+(?:mereka|dia)|halal\\s+darahnya"),
  word("убейте|убить\\s+(?:их|его|всех)|смерть\\s+(?:им|ему)"),
  word("قتل\\s+کرو|مار\\s+ڈالو|بکشید|بکشیدشان"),
  word("waueni|wachinjeni|ku\\s+kashe\\s+su|a\\s+kashe\\s+su"),
  word("মেরে\\s+ফেলো|হত্যা\\s+করো"),
];

const ADS: RegExp[] = [
  word("واتساب|واتس\\s*اب|واتس|تيليجرام|تلغرام|تليجرام|سناب\\s*شات|انستقرام|انستغرام"),
  word("(?:تواصل|تواصلوا|راسلني|راسلوني|كلمني|اتصل\\s+بي|اتصلوا\\s+بي)\\s+(?:معي|معنا|علي|على|عبر|خاص|بالخاص|في\\s+الخاص)?|للتواصل\\s+(?:على|عبر|واتساب)|للطلب|اطلب\\s+الان|اشترك\\s+الان|اتصل\\s+الان|عرض\\s+خاص|عرض\\s+محدود|كود\\s+خصم|كوبون|خصم\\s+\\d+|تخفيضات|للبيع|سعر\\s+مميز|توصيل\\s+مجاني|اربح\\s+(?:المال|\\d+)|دخل\\s+يومي|ربح\\s+مضمون|استثمار\\s+مضمون|تداول\\s+العملات|فوركس"),
  word("whats\\s*app|telegram|wa\\.me|buy\\s+now|order\\s+now|shop\\s+now|discount\\s+code|promo\\s+code|coupon|click\\s+here|limited\\s+offer|free\\s+shipping|for\\s+sale|casino|betting|forex|crypto\\s+signals|earn\\s+\\$?\\d+|make\\s+money\\s+(?:fast|online|from\\s+home)|dm\\s+me|inbox\\s+me|contact\\s+me\\s+(?:on|at|via)|call\\s+me\\s+(?:on|at)|best\\s+price"),
  word("hemen\\s+(?:satın\\s+al|sipariş)|indirim\\s+kodu|achetez\\s+maintenant|code\\s+promo|beli\\s+sekarang|hubungi\\s+(?:saya|kami)\\s+di|promo\\s+murah|купить\\s+сейчас|скидк\\S*|промокод|nunua\\s+sasa|saya\\s+yanzu"),
  // رقم هاتف: تسعة أرقام فأكثر متتابعة (بمسافات أو شرطات).
  /(?:\+|00)?\d(?:[\s\-.()]*\d){8,}/u,
];

/** كل رابط في النص: بالبروتوكول أو www أو نطاق عارٍ (example.com/…). */
const URL_RE =
  /(?:https?:\/\/|www\.)[^\s<>"'«»]+|(?<![\p{L}\p{N}@.\-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|net|org|info|io|ly|me|co|xyz|ru|tk|top|link|click|shop|store|biz|site|online|app|live|club|vip|gg|to|cc|ws|tv|sa|ae|eg|pk|id|my|tr|ir|ng|ke|bd|in|uk|us|fr|de)(?![\p{L}\p{N}])(?:\/[^\s<>"'«»]*)?/giu;

/** النطاق من رابط (بلا www)، أو null. */
function hostOf(raw: string): string | null {
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function allowedHost(host: string): boolean {
  return FORUM_LINK_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

/** الروابط المرفوضة في النص (من خارج المرجعية، أو مختصرة، أو بعنوان IP). */
export function suspiciousLinks(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const host = hostOf(m[0].replace(/[).,،؛!?؟]+$/u, ""));
    if (!host || !allowedHost(host)) out.push(m[0]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// الحكم الشرعي الجازم من غير مختص ← تنبيه، لا رفض.
// ---------------------------------------------------------------------------

const RULING: RegExp[] = [
  // العربية
  word("(?:هذا|هذه|ذلك|هو|هي)\\s+(?:حرام|محرم|حلال|واجب|فرض|بدعه|شرك|كفر|جائز|مكروه|لا\\s+يجوز|غير\\s+جائز)"),
  word("(?:حرام|محرم|حلال|واجب|بدعه|شرك|جائز|لا\\s+يجوز)\\s+(?:قطعا|قطعيا|بلا\\s+شك|بلا\\s+خلاف|بالاجماع|بالتاكيد|اكيد|يقينا)"),
  word("(?:يجوز|لا\\s+يجوز|يحرم|يجب|يلزم|لا\\s+يلزم|يكفي|لا\\s+يكفي)\\s+(?:لك|لكي|لكم|عليك|عليكي|عليكم)"),
  word("(?:صلاتك|صلاتكم|صومك|صيامك|زواجك|نكاحك|طلاقك|وضووك|وضوءك|حجك|عمرتك|زكاتك|عقدك|بيعك)\\s+(?:باطل|باطله|صحيح|صحيحه|فاسد|فاسده|واقع|واقعه|مقبول|مقبوله|غير\\s+صحيح|غير\\s+صحيحه)"),
  word("افتيك|افتيكم|فتواي|الحكم\\s+(?:هو|انه|انها)\\s+(?:حرام|حلال|واجب|جائز)|(?:عليك|عليكم)\\s+(?:الكفاره|القضاء|الاعاده|الفديه)"),
  // الإنجليزية
  word("(?:it\\s+is|it's|its|this\\s+is|that\\s+is|that's)\\s+(?:definitely\\s+|absolutely\\s+|clearly\\s+|totally\\s+)?(?:haram|halal|forbidden|prohibited|permissible|allowed|obligatory|fard|wajib|bid'?ah|shirk|kufr|makruh|not\\s+allowed|not\\s+permissible|invalid|valid)"),
  word("(?:definitely|absolutely|clearly|100%)\\s+(?:haram|halal|forbidden|bid'?ah|shirk)"),
  word("you\\s+(?:must|have\\s+to|are\\s+(?:not\\s+)?allowed\\s+to|are\\s+obliged\\s+to|may\\s+not)\\s+\\S+|your\\s+(?:prayer|fast|marriage|divorce|wudu|hajj|nikah)\\s+is\\s+(?:invalid|valid|void|accepted|not\\s+valid)"),
  // التركية، والفرنسية، والإندونيسية/الملايوية، والأردية، والفارسية، والروسية، والسواحيلية، والهوسا، والبنغالية
  word("haramdır|helaldir|caizdir|caiz\\s+değildir|farzdır|bid'?attır|şirktir|kesinlikle\\s+haram"),
  word("(?:c'est|c’est|cela\\s+est)\\s+(?:haram|halal|interdit|illicite|licite|permis|obligatoire|une\\s+innovation)|tu\\s+(?:dois|n'as\\s+pas\\s+le\\s+droit|as\\s+le\\s+droit)"),
  word("(?:itu|ini|hukumnya|hukum\\s+nya)\\s+(?:haram|halal|wajib|bid'?ah|syirik|makruh|sunnah\\s+muakkad)|(?:kamu|anda|awak)\\s+(?:wajib|harus|tidak\\s+boleh|boleh)"),
  word("(?:یہ|یه|یہی)\\s+(?:حرام|حلال|جائز|ناجائز|واجب|فرض|بدعت|شرک)\\s+(?:ہے|هے)|(?:این|اين)\\s+(?:حرام|حلال|واجب|جایز|جائز|بدعت|شرک)\\s+(?:است|هست)"),
  word("это\\s+(?:харам|халяль|запрещено|дозволено|обязательно|бидаа|ширк)|(?:ты|вы)\\s+(?:должен|должны|обязан|обязаны)"),
  word("(?:hii|hiyo|hilo|huo|ni)\\s+(?:haramu|halali|wajibu|bidaa|shirki)|haramun\\s+ne|haram\\s+ne|halal\\s+ne|ya\\s+halatta|bai\\s+halatta\\s+ba"),
  word("(?:এটা|এটি|ইহা)\\s+(?:হারাম|হালাল|ফরজ|ওয়াজিব|বিদআত|শিরক)"),
];

/** جمل النص؛ الجملة الاستفهامية («هل هذا حرام؟») ليست حكماً. */
function assertiveSentences(text: string): string[] {
  return text
    .split(/(?<=[.!؟?\n۔।])\s*/u)
    .map((s) => s.trim())
    .filter((s) => s && !/[?؟]/.test(s));
}

/** هل في النص حكم شرعي جازم (يُنشر مع تنبيه)؟ */
export function hasDefinitiveRuling(text: string): boolean {
  return assertiveSentences(normalizeForum(text)).some((s) => RULING.some((re) => re.test(s)));
}

/**
 * فحص النص قبل النشر. expert = مختص مقبول: يُنشر كما هو، بلا رفض ولا تنبيه.
 * ترتيب الأسباب: الأشد أولاً (التحريض، فالتكفير، فالسبّ، فالإعلان، فالرابط).
 */
export function checkForumText(text: string, { expert = false }: { expert?: boolean } = {}): ForumVerdict {
  if (expert) return { ok: true, rulingNotice: false };
  const n = normalizeForum(text);
  if (INCITEMENT.some((re) => re.test(n))) return { ok: false, reason: "incitement" };
  if (TAKFIR.some((re) => re.test(n))) return { ok: false, reason: "takfir" };
  if (INSULT.some((re) => re.test(n))) return { ok: false, reason: "insult" };
  if (suspiciousLinks(text).length) return { ok: false, reason: "link" };
  // الرقم الطويل داخل رابط مسموح (رقم فتوى مثلاً) ليس هاتفاً.
  const withoutLinks = n.replace(URL_RE, " ");
  if (ADS.some((re) => re.test(withoutLinks))) return { ok: false, reason: "ads" };
  return { ok: true, rulingNotice: hasDefinitiveRuling(text) };
}
