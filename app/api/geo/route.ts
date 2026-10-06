import { NextResponse } from "next/server";
import { placeFromHeaders } from "@/lib/prayer/geo";

/**
 * F2: موقع الزائر التقريبي من ترويسات Vercel (من عنوان IP)، لبطاقة المواقيت. لا يُحفظ شيء، ولا يُسجَّل.
 * إن غابت الترويسات (بيئة محلية): مكة المكرمة بطريقة أم القرى.
 */
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return NextResponse.json(placeFromHeaders(request.headers), { headers: { "Cache-Control": "private, no-store" } });
}
