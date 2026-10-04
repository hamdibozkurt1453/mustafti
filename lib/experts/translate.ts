import "server-only";

import { glossaryBlock } from "@/lib/brain/glossary";
import { chat, isLlmConfigured } from "@/lib/llm";

/**
 * ترجمة جواب المختص إلى لغة السائل (S9).
 * - المصدر هو نص المختص وحده، والمصطلحات من القاموس المعتمد (glossary).
 * - لا يمر على الحارس (guard): الحكم هنا من المختص لا من النموذج، والنموذج يترجم فقط.
 * - أي فشل يعيد null، فيُحفظ الجواب العربي وحده ولا يتعطل الإرسال.
 */
export async function translateAnswer(answerAr: string, lang: string): Promise<string | null> {
  if (!isLlmConfigured()) return null;
  const glossary = glossaryBlock(lang, answerAr);
  const system = [
    `You are a faithful translator. Translate the Arabic text written by a qualified Islamic scholar into the language with code "${lang}".`,
    "Rules:",
    "- Translate only. Do not add, remove, soften, strengthen, explain or comment on anything.",
    "- Keep the scholar's ruling, conditions and wording exactly as meant.",
    "- Quranic verses and hadith quoted in the text: translate their meaning and keep any reference (surah, number, book) as written.",
    "- Keep paragraphs and line breaks.",
    "- Output the translation only, with no introduction or notes.",
    glossary,
  ]
    .filter(Boolean)
    .join("\n");
  try {
    const res = await chat(
      [
        { role: "system", content: system },
        { role: "user", content: answerAr },
      ],
      { temperature: 0.1, maxTokens: 2500, timeoutMs: 25_000, retries: 1 },
    );
    const text = res.text.trim();
    return text ? text : null;
  } catch (error) {
    console.error("expert answer translation:", error instanceof Error ? error.message : error);
    return null;
  }
}
