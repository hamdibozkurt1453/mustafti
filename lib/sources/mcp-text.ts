/**
 * إزالة «الترويسة التقنية» من نصوص خادم MCP قبل عرضها (نقي، يُختبر محلياً):
 *   «──── RETRIEVED FROM QURANENC — published text ────»، «[EXACT] the verse itself — reproduce these
 *   words exactly»، «[/EXACT]»، «[Surah 2, translation "arabic_moyassar"]»، «Source: https://…»،
 *   «──── CITE ────» وما بعده، «Every result you carry into your reply must bring the URL…».
 * تعمل على النص بأسطره أو بعد دمجه سطراً واحداً (htmlToText يدمج الأسطر). ولا تمس مراجع الآيات
 * «[2:127]» التي يحتاجها تحليل نص الآيات (quran-index.ts)؛ العرض يزيلها في cleanForDisplay.
 */
export function stripMcpChrome(text: string): string {
  return (
    text
      // ذيل الرد: CITE أو END OF RETRIEVED TEXT وما بعدهما ليس من النص المنشور.
      .replace(/─{2,}\s*(?:CITE|END OF RETRIEVED TEXT)\b[\s\S]*$/i, "")
      .replace(/\bEND OF RETRIEVED TEXT\b[\s\S]*$/i, "")
      .replace(/\bEvery (?:result|item) you carry into your (?:reply|answer)[^\n]*?(?:URL|link)[^.\n]*\.?/gi, " ")
      // رأس «RETRIEVED FROM X — published text» بخطوطه أو بدونها.
      .replace(/─{2,}[^─\n]*?RETRIEVED FROM[^─\n]*?─{2,}/gi, " ")
      .replace(/\bRETRIEVED FROM\s+[A-Z][A-Z0-9_ .-]*?(?:\s*[—–-]\s*published text)?(?=\s|$|[^\w])/gi, " ")
      // وسم مع تعليمات الخادم للنموذج حتى «exactly/verbatim» (على السطر نفسه).
      .replace(/\[(?:EXACT|VERBATIM|QUOTE|TEXT)\][^\n[\]]*?(?:reproduce|copy|quote)[^\n[\]]*?(?:exactly|verbatim)\b[.:]?/gi, " ")
      .replace(/\[\/?(?:EXACT|VERBATIM|QUOTE|TEXT|CITE|SOURCE|META)\]/gi, " ")
      .replace(/\[Surah\s+\d+[^\]]*\]/gi, " ")
      .replace(/\bSource:\s*https?:\/\/\S+/gi, " ")
      .replace(/─{2,}/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/[ \t]*\n[ \t]*/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
