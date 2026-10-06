import { NextResponse } from "next/server";
import { exportFileName } from "@/lib/account/rules";
import { getAuthContext } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

/**
 * «تنزيل بياناتي» (R2): ملف JSON بكل ما يخص المستخدم، بجلسته (RLS: صفوفه فقط).
 * الملف الشخصي، وطلب المختص إن وُجد (بلا مسارات الوثائق)، والمسائل بملفاتها ورسائلها والأجوبة عليها،
 * وF2: سجل المحادثات برسائله (قبل migration ‏20261013_conversations.sql يُترك فارغاً بلا خطأ).
 */
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const [profile, expert, cases] = await Promise.all([
    supabase.from("profiles").select("email, display_name, preferred_lang, city, calc_method, created_at").eq("id", ctx.userId).maybeSingle(),
    supabase
      .from("experts")
      .select("role, specialty, country, languages, degree, institution, grad_year, traditional, bio, socials, slug, status, created_at")
      .eq("id", ctx.userId)
      .maybeSingle(),
    supabase
      .from("cases")
      .select(
        "id, status, chapter, lang, created_at, case_files(pillars, summary_ar, summary_user_lang, unknowns, approved_at, created_at), case_messages(sender, content, created_at), expert_answers(answer_ar, answer_translated, created_at)",
      )
      .eq("owner_id", ctx.userId)
      .order("created_at", { ascending: false }),
  ]);
  const conversations = await supabase
    .from("conversations")
    .select("id, mode, title, created_at, updated_at, messages(seq, role, content, reply, created_at)")
    .order("updated_at", { ascending: false });
  const failed = [profile, expert, cases].find((r) => r.error);
  if (failed?.error) {
    console.error("export:", failed.error.message);
    return NextResponse.json({ error: "generic" }, { status: 500 });
  }

  const now = new Date();
  const body = JSON.stringify(
    { exported_at: now.toISOString(), source: "https://mustafti.com", account: { email: ctx.email, ...profile.data }, expert: expert.data, cases: cases.data, conversations: conversations.error ? [] : conversations.data },
    null,
    2,
  );
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(now)}"`,
      "Cache-Control": "no-store",
    },
  });
}
