/**
 * F3: أبواب «الحوار» الافتراضية بأسمائها في اللغات الاثنتي عشرة.
 * هي نفسها بذرة جدول forum_categories في supabase/migrations/20261013_forum_categories.sql
 * (اختبار tests/f3.test.ts يتحقق من التطابق)، واحتياط الواجهة إن تعذّرت قراءة الجدول.
 * الأبواب الجديدة تُضاف من لوحة المشرف (super_admin) لا من هنا.
 */

import type { Locale } from "@/i18n/locales";

export type CategoryNames = Partial<Record<Locale, string>>;

export type ForumCategoryRow = { slug: string; name: CategoryNames; order: number; active: boolean };

export const DEFAULT_FORUM_CATEGORIES: ForumCategoryRow[] = [
  {
    slug: "aqeedah",
    order: 10,
    active: true,
    name: { ar: "عقيدة", en: "Creed", id: "Akidah", ur: "عقیدہ", bn: "আকিদা", tr: "Akaid", fa: "عقیده", fr: "Croyance", ms: "Akidah", ru: "Вероубеждение", sw: "Itikadi", ha: "Aƙida" },
  },
  {
    slug: "ibadat",
    order: 20,
    active: true,
    name: { ar: "عبادات", en: "Worship", id: "Ibadah", ur: "عبادات", bn: "ইবাদত", tr: "İbadetler", fa: "عبادات", fr: "Adoration", ms: "Ibadah", ru: "Поклонение", sw: "Ibada", ha: "Ibada" },
  },
  {
    slug: "muamalat",
    order: 30,
    active: true,
    name: { ar: "معاملات", en: "Transactions", id: "Muamalah", ur: "معاملات", bn: "মুআমালাত", tr: "Muamelat", fa: "معاملات", fr: "Transactions", ms: "Muamalat", ru: "Взаимоотношения", sw: "Miamala", ha: "Mu'amala" },
  },
  {
    slug: "family",
    order: 40,
    active: true,
    name: { ar: "أسرة", en: "Family", id: "Keluarga", ur: "خاندان", bn: "পরিবার", tr: "Aile", fa: "خانواده", fr: "Famille", ms: "Keluarga", ru: "Семья", sw: "Familia", ha: "Iyali" },
  },
  {
    slug: "new_muslim",
    order: 50,
    active: true,
    name: { ar: "مسلم جديد", en: "New Muslim", id: "Mualaf", ur: "نیا مسلمان", bn: "নতুন মুসলিম", tr: "Yeni Müslüman", fa: "تازه‌مسلمان", fr: "Nouveau musulman", ms: "Mualaf", ru: "Новый мусульманин", sw: "Muislamu mpya", ha: "Sabon Musulmi" },
  },
  {
    slug: "seerah",
    order: 60,
    active: true,
    name: { ar: "سيرة", en: "Seerah", id: "Sirah", ur: "سیرت", bn: "সীরাত", tr: "Siyer", fa: "سیره", fr: "Sîra", ms: "Sirah", ru: "Сира", sw: "Sira", ha: "Sira" },
  },
  {
    slug: "tafsir",
    order: 70,
    active: true,
    name: { ar: "تفسير", en: "Tafsir", id: "Tafsir", ur: "تفسیر", bn: "তাফসীর", tr: "Tefsir", fa: "تفسیر", fr: "Exégèse", ms: "Tafsir", ru: "Тафсир", sw: "Tafsiri", ha: "Tafsiri" },
  },
  {
    slug: "hadith",
    order: 80,
    active: true,
    name: { ar: "حديث", en: "Hadith", id: "Hadis", ur: "حدیث", bn: "হাদিস", tr: "Hadis", fa: "حدیث", fr: "Hadith", ms: "Hadis", ru: "Хадисы", sw: "Hadithi", ha: "Hadisi" },
  },
  {
    slug: "akhlaq",
    order: 90,
    active: true,
    name: { ar: "أخلاق", en: "Character", id: "Akhlak", ur: "اخلاق", bn: "আখলাক", tr: "Ahlak", fa: "اخلاق", fr: "Éthique", ms: "Akhlak", ru: "Нравственность", sw: "Maadili", ha: "Ɗabi'u" },
  },
  {
    slug: "dawah",
    order: 100,
    active: true,
    name: { ar: "دعوة", en: "Da'wah", id: "Dakwah", ur: "دعوت", bn: "দাওয়াহ", tr: "Davet", fa: "دعوت", fr: "Prédication", ms: "Dakwah", ru: "Призыв", sw: "Da'awa", ha: "Da'awa" },
  },
  {
    slug: "history",
    order: 110,
    active: true,
    name: { ar: "تاريخ إسلامي", en: "Islamic history", id: "Sejarah Islam", ur: "اسلامی تاریخ", bn: "ইসলামের ইতিহাস", tr: "İslam tarihi", fa: "تاریخ اسلام", fr: "Histoire islamique", ms: "Sejarah Islam", ru: "История ислама", sw: "Historia ya Kiislamu", ha: "Tarihin Musulunci" },
  },
  {
    slug: "arabic",
    order: 120,
    active: true,
    name: { ar: "لغة عربية", en: "Arabic language", id: "Bahasa Arab", ur: "عربی زبان", bn: "আরবি ভাষা", tr: "Arap dili", fa: "زبان عربی", fr: "Langue arabe", ms: "Bahasa Arab", ru: "Арабский язык", sw: "Lugha ya Kiarabu", ha: "Harshen Larabci" },
  },
  {
    slug: "general",
    order: 1000,
    active: true,
    name: { ar: "عام", en: "General", id: "Umum", ur: "عمومی", bn: "সাধারণ", tr: "Genel", fa: "عمومی", fr: "Général", ms: "Umum", ru: "Общее", sw: "Jumla", ha: "Gabaɗaya" },
  },
];
