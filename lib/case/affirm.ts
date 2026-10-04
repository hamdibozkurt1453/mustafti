/**
 * «نعم، ساعدني»: ردّ بالموافقة بعد رسالة الإحالة يبدأ الاستيضاح مباشرة، ولا يُرسل إلى
 * المحادثة (فلا تتكرر رسالة الإحالة). الفحص بالكود وفي المتصفح، بلغات السائلين.
 * الملف نقي ليُختبر: tests/case.test.ts.
 */

/** كلمات الموافقة وطلب المساعدة. الرسالة كلها يجب أن تتكون منها (مع علامات الترقيم). */
const AFFIRM_WORDS = [
  // العربية
  "نعم", "اي", "أي", "إي", "ايوه", "أيوه", "ايوا", "أجل", "اجل", "بلى", "طيب", "حسنا", "حسناً", "موافق", "موافقة",
  "تمام", "اوكي", "أوكي", "ساعدني", "ساعديني", "ساعدوني", "أرجو", "ارجو", "رجاء", "رجاءً", "من", "فضلك", "لو", "سمحت",
  "ابدأ", "ابدا", "إبدأ", "لنبدأ", "هيا", "أريد", "اريد", "ذلك", "هذا", "أرسله", "ارسله", "أرسل", "ارسل", "سؤالي", "و",
  "الله", "يجزاك", "جزاك", "خيرا", "خيراً", "شكرا", "شكراً", "بالتأكيد", "طبعا", "طبعاً", "أكيد", "اكيد",
  // English
  "yes", "yeah", "yep", "yup", "ok", "okay", "sure", "please", "pls", "help", "me", "start", "go", "ahead", "let's",
  "lets", "do", "it", "i", "want", "would", "like", "that", "to", "send", "agree", "of", "course", "alright", "fine",
  "thanks", "thank", "you", "and",
  // Türkçe
  "evet", "tamam", "olur", "lütfen", "yardım", "et", "edin", "başla", "başlayalım", "istiyorum", "gönder",
  // Français
  "oui", "d'accord", "daccord", "aide-moi", "aidez-moi", "aide", "moi", "s'il", "te", "vous", "plaît", "plait",
  "commence", "commencez", "allons-y", "je", "veux", "bien", "sûr", "merci",
  // اردو
  "جی", "ہاں", "ہاں،", "جی ہاں", "ٹھیک", "ہے", "مدد", "کریں", "کرو", "میری", "شروع", "براہ", "کرم",
  // Indonesia / Melayu
  "ya", "iya", "baik", "boleh", "tolong", "bantu", "saya", "mulai", "silakan", "setuju", "mau", "ingin",
];

const WORDS = new Set(AFFIRM_WORDS.map((w) => w.toLowerCase()));

/** كلمات يكفي وجود واحدة منها لتكون الرسالة موافقة (وليست شكراً أو «من» وحدها). */
const CORE = new Set(
  [
    "نعم", "اي", "أي", "إي", "ايوه", "أيوه", "ايوا", "أجل", "اجل", "بلى", "طيب", "حسنا", "حسناً", "موافق", "موافقة", "تمام",
    "اوكي", "أوكي", "ساعدني", "ساعديني", "ساعدوني", "ابدأ", "ابدا", "إبدأ", "لنبدأ", "هيا", "أرسله", "ارسله", "بالتأكيد",
    "طبعا", "طبعاً", "أكيد", "اكيد",
    "yes", "yeah", "yep", "yup", "ok", "okay", "sure", "help", "start", "agree", "alright",
    "evet", "tamam", "olur", "yardım", "başla", "başlayalım",
    "oui", "d'accord", "daccord", "aide-moi", "aidez-moi", "aide", "commence", "commencez", "allons-y",
    "جی", "ہاں", "ٹھیک", "مدد", "شروع",
    "ya", "iya", "baik", "boleh", "tolong", "bantu", "mulai", "setuju",
  ].map((w) => w.toLowerCase()),
);

export function isAffirmative(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t || t.length > 60) return false;
  const tokens = t
    .replace(/[.,!?؟،؛:;"«»()…\-–—]+/gu, " ")
    .split(/\s+/u)
    .filter(Boolean)
    // «ساعدنى» و«ساعدني»؛ «نعمم»
    .map((w) => w.replace(/ى$/u, "ي"));
  if (!tokens.length || tokens.length > 8) return false;
  const emoji = (w: string) => /^\p{Extended_Pictographic}+$/u.test(w);
  return tokens.every((w) => WORDS.has(w) || emoji(w)) && tokens.some((w) => CORE.has(w) || w.includes("👍"));
}
