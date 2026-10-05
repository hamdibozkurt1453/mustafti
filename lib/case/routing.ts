import type { CaseTrack } from "@/lib/brain/modes";
import type { Chapter, ReferralKind } from "./types";

/**
 * التوجيه والأولوية لملف المسألة (السبيكات، القسم 4 «سلّم المخاطر»):
 * - route_to: mufti افتراضياً، وmentor لأسئلة المسلم الجديد الشخصية.
 *   R3: مسار «المرشد» (track = new_muslim) إلى mentor دائماً، ومسار «الداعية» (discover) إلى daee،
 *   وإن لم يوجد مختص معتمد بالدور المطلوب فإلى المفتي مع ملاحظة في المسألة (resolveRoute).
 * - priority: high للطلاق والخلع، والمواريث، والنزاعات، والدماء والجنايات، والحكم على الأشخاص.
 * الملف نقي ليُختبر: tests/case.test.ts.
 */

export type RouteTo = "mufti" | "mentor" | "daee";
export type Priority = "high" | "normal";

export function routeTo(chapter: Chapter, userType: string | undefined, kind: ReferralKind, track: CaseTrack = "general"): RouteTo {
  if (track === "new_muslim") return "mentor";
  if (track === "discover") return "daee";
  const newMuslim = chapter === "new_muslim" || userType === "new_muslim";
  return newMuslim && kind === "personal" ? "mentor" : "mufti";
}

/**
 * الاحتياط: المفتي إن لم يوجد مختص معتمد (approved) بالدور المطلوب. approved: الأدوار التي لها
 * مختص معتمد واحد على الأقل، أو null إن تعذّرت القراءة (فيبقى الدور المطلوب ولا يُغيَّر شيء).
 * fallbackFrom: الدور المطلوب أصلاً، لملاحظة المسألة.
 */
export function resolveRoute(wanted: RouteTo, approved: ReadonlySet<string> | null): { routeTo: RouteTo; fallbackFrom?: RouteTo } {
  if (wanted === "mufti" || !approved || approved.has(wanted)) return { routeTo: wanted };
  return { routeTo: "mufti", fallbackFrom: wanted };
}

/** ملاحظة المسألة عند الاحتياط (بالعربية، يقرؤها المختص والمشرف). */
export function fallbackNoteAr(from: RouteTo): string {
  return from === "mentor"
    ? "لا يوجد مرشد معتمد للمسلمين الجدد الآن، فأُحيلت المسألة إلى المفتي."
    : "لا يوجد داعية معتمد الآن، فأُحيلت المسألة إلى المفتي.";
}

const HIGH_CHAPTERS: readonly Chapter[] = ["talaq_khul", "inheritance_wills"];

/** كلمات عربية/أردية كاملة: بسوابق (و، ف، ب، ل، ال) ولواحق ضمائر، لا داخل كلمة أخرى («دم» ليست في «عدم»). */
function words(list: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{M}])(?:[وفبل]|ال|وال|بال|لل|فال)?(?:${list})(?:ه|ها|هم|ات|ة|ي|ني)?(?![\\p{L}\\p{M}])`, "u");
}

/** النزاعات، والدماء والجنايات، والحكم على الأشخاص، بست لغات (كلمات دالة لا أحكام). */
const HIGH_RISK: RegExp[] = [
  // نزاع أسري أو مالي أو قضائي
  words("نزاع|خصام|شجار|قطيعة|محكمة|قضية|دعوى|حضانة|ميراث|تركة|طلاق|خلع"),
  /خلاف\s+(مع|بين)/u,
  /\b(dispute|conflict|court|lawsuit|custody|estranged|inheritance|divorce)\b/i,
  /\b(anlaşmazlık|kavga|mahkeme|dava|velayet|miras|boşan\w*)\b/iu,
  /\b(litige|conflit|tribunal|procès|garde\s+des\s+enfants|héritage|divorce)\b/iu,
  words("جھگڑا|تنازع|عدالت|مقدمہ|وراثت"),
  /\b(sengketa|perselisihan|pengadilan|hak\s+asuh|warisan|cerai|talak)\b/iu,
  // الدماء والجنايات
  words("قتل|يقتل|قتلت|دم|دماء|جناية|جنايات|قصاص|دية|ضرب|يضرب|ضربت|جرح|إجهاض|اجهاض|سرق|يسرق|تسرق|سرقت|سرقة|اعتداء|حادث"),
  /\b(kill\w*|murder\w*|blood\s*money|diyah|qisas|injur\w*|assault\w*|abortion|steal\w*|theft|stole|accident)\b/i,
  /\b(öldür\w*|cinayet|kısas|yaral\w*|kürtaj|hırsızlık|çaldı\w*|çalmak|çalıntı|trafik\s+kazası)\b/iu,
  /\b(tu[ée]\w*|meurtre|blessure|avortement|volé\w*|voler|cambriol\w*)\b/iu,
  words("خون|دیت|زخمی|اسقاط|چوری|حادثہ"),
  /\b(membunuh|pembunuhan|diyat|melukai|aborsi|mencuri|pencurian|kecelakaan)\b/iu,
  // الحكم على الأشخاص والجماعات
  words("تكفير|كافر|مرتد|ردة|منافق|فاسق|مبتدع|ضال"),
  /\b(apostate|apostasy|kafir|takfir|disbeliever|heretic|hypocrite)\b/i,
  /\b(kâfir|kafir|mürted|tekfir|münafık)\b/iu,
  /\b(apostat|apostasie|mécréant|hérétique)\b/iu,
  words("کافر|تکفیر"),
  /\b(kafir|murtad|takfir|munafik|sesat)\b/iu,
];

export function priorityOf(chapter: Chapter, text: string): Priority {
  if (HIGH_CHAPTERS.includes(chapter)) return "high";
  return HIGH_RISK.some((r) => r.test(text)) ? "high" : "normal";
}
