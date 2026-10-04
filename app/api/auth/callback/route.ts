import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { bootstrapAdmin } from "@/lib/auth/bootstrap-admin";
import { safeNext } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/auth/callback — وجهة روابط البريد (الرابط السحري وتأكيد الحساب).
 * يقبل ?code= (PKCE) أو ?token_hash=&type= ، ثم يحوّل إلى ?next= داخل الموقع.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNext(url.searchParams.get("next"));
  const locale = next.split("/")[1] || "ar";
  const supabase = await createClient();

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }

  if (!ok) {
    return NextResponse.redirect(new URL(`/${locale}/login?error=link`, url.origin));
  }

  const { data } = await supabase.auth.getUser();
  if (data.user) await bootstrapAdmin(data.user);

  return NextResponse.redirect(new URL(next, url.origin));
}
