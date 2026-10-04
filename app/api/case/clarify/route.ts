import { z } from "zod";
import { planClarify } from "@/lib/case/clarify";
import { withAskerCountry } from "@/lib/case/flow";
import { countryName } from "@/lib/experts/countries";
import { ChapterSchema, guardCaseRequest, KindSchema, LangSchema, QuestionSchema } from "@/lib/case/http";

/**
 * POST /api/case/clarify — أسئلة الاستيضاح لسؤال من المستوى D (lib/case/clarify.ts).
 * المدخل: السؤال ولغته وبابه ونوع السائل كما صنّفها /api/chat. المخرج: الخطة كاملة،
 * والمتصفح يعرضها سؤالاً سؤالاً (بلا طلب لكل سؤال). سؤال البلد يحمل بلد السائل زراً جاهزاً
 * (من ترويسة x-vercel-ip-country، الاسم العربي فقط، لا عنوان IP).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Body = z.object({
  question: QuestionSchema,
  lang: LangSchema,
  chapter: ChapterSchema.nullish(),
  userType: z.string().max(20).nullish(),
  kind: KindSchema,
});

export async function POST(request: Request) {
  const gate = await guardCaseRequest(request, "case", 40);
  if ("response" in gate) return gate.response;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const plan = await planClarify(parsed.data);
  return Response.json({ plan: withAskerCountry(plan, countryName(request.headers.get("x-vercel-ip-country"), "ar")) });
}
