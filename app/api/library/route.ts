import { NextResponse } from "next/server";
import { locales } from "@/i18n/locales";
import { latestBooks, searchBooks, topicBooks } from "@/lib/library/islamhouse";
import { IslamhouseError, isTopicKey, parsePage } from "@/lib/library/islamhouse-core";
import { cleanQuery } from "@/lib/library/items";
import { checkRateLimit } from "@/lib/rate-limit";

/** حد البحث بالكلمة كما في الصفحة: 60 طلباً في الساعة لكل IP. */
const LIBRARY_LIMIT_PER_HOUR = 60;

/**
 * F2: «اكتشف المزيد» في المكتبة: الصفحة التالية (6 كتب) من القائمة الافتراضية أو التصنيف أو البحث.
 * ‎?page=2&lang=ar[&topic=…|&q=…]. يعيد { books, hasMore, page }.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang") ?? "";
  if (!(locales as readonly string[]).includes(lang)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const page = parsePage(url.searchParams.get("page"));
  const q = cleanQuery(url.searchParams.get("q") ?? undefined);
  const topic = url.searchParams.get("topic") ?? "";

  try {
    let result;
    if (q) {
      const rate = await checkRateLimit("library", request.headers, LIBRARY_LIMIT_PER_HOUR, 3600);
      if (!rate.ok) return NextResponse.json({ error: "limited" }, { status: 429 });
      result = await searchBooks(q, lang, page);
    } else if (isTopicKey(topic)) {
      result = await topicBooks(topic, lang, page);
    } else {
      result = await latestBooks(lang, page);
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (e) {
    console.error("library more:", e instanceof Error ? e.message : e);
    const timeout = e instanceof IslamhouseError && e.kind === "timeout";
    return NextResponse.json({ error: timeout ? "timeout" : "unavailable" }, { status: 502 });
  }
}
