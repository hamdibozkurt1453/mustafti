import { NextResponse } from "next/server";
import { bootstrapAdmin } from "@/lib/auth/bootstrap-admin";
import { demoEmail, demoLoginEnabled } from "@/lib/demo/rules";
import { checkRateLimit } from "@/lib/rate-limit";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/demo-login ‏{ role: "user" | "specialized" | "admin" }
 * دخول تجريبي للجنة التحكيم — **للعرض فقط، ويُحذف بعد المسابقة** (F5).
 * يعمل فقط مع DEMO_LOGIN=true وكلمة المرور في DEMO_ACCOUNTS_PASSWORD؛ وإلا 404.
 */
/** S13: حد الدخول التجريبي لكل IP: 10 محاولات في 10 دقائق. */
const DEMO_LOGIN_LIMIT = 10;
const DEMO_LOGIN_WINDOW_SECONDS = 600;

export async function POST(request: Request) {
  if (!demoLoginEnabled() || !isSupabaseConfigured()) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  // من الموقع نفسه فقط.
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const rate = await checkRateLimit("demo-login", request.headers, DEMO_LOGIN_LIMIT, DEMO_LOGIN_WINDOW_SECONDS);
  if (!rate.ok) return NextResponse.json({ ok: false }, { status: 429 });
  const body = await request.json().catch(() => null);
  const email = demoEmail(body?.role);
  if (!email) return NextResponse.json({ ok: false }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: process.env.DEMO_ACCOUNTS_PASSWORD!.trim() });
  if (error) return NextResponse.json({ ok: false }, { status: 401 });
  await bootstrapAdmin(data.user);
  return NextResponse.json({ ok: true });
}
