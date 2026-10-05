import "server-only";

import { mcpSearch } from "@/lib/sources/mcp-search";
import { toLibraryCards, type LibraryCard } from "./items";

/**
 * البحث في مكتبة IslamHouse عبر خادم MCP: أداة search بـ sources=["library"] وبلغة الواجهة
 * (browse_library موقوف منذ R1e). النتائج مخزّنة 24 ساعة في lib/mcp.ts.
 * يعيد null إن تعذّر الخادم (فتظهر رسالة لطيفة بدل خطأ).
 */
export async function searchLibrary(query: string, locale: string): Promise<LibraryCard[] | null> {
  try {
    return toLibraryCards(await mcpSearch(query, locale, "library"));
  } catch (error) {
    console.error("library search:", error instanceof Error ? error.message : error);
    return null;
  }
}
