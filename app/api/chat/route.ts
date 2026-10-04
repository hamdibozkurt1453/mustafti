import { after } from "next/server";
import { z } from "zod";
import { requireRole, authzResponse } from "@/lib/auth/roles";
import { respond, type BrainReply } from "@/lib/brain/respond";
import { guessLang } from "@/lib/brain/identity";
import { dirForLang, MAX_HISTORY, MAX_QUESTION_CHARS, type ChatEvent, type ChatSource } from "@/lib/chat/protocol";
import { llmUserMessage } from "@/lib/llm";
import { checkChatRateLimit, CHAT_LIMIT_PER_HOUR } from "@/lib/rate-limit";
import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";
import { cleanForDisplay } from "@/lib/brain/quran-index";

/**
 * POST /api/chat — المحادثة الحية (بث NDJSON، البروتوكول في lib/chat/protocol.ts).
 *
 * فحص الدور (الزائر مسموح) ← حد الطلبات (30 في الساعة لكل IP) ← lib/brain/respond.ts كما هو
 * (الهوية، والتصنيف، والعاجل، والإحالة، والاسترجاع، والصياغة، والحارس). هذا المسار لا يكرر
 * شيئاً من منطقه: يبث مراحله، ثم بطاقات المصادر، ثم نصه بعد الحارس كلمةً كلمة.
 * لماذا لا نبث التوليد مباشرة؟ لأن الحارس يفحص الجواب كاملاً قبل أن يرى السائل أي كلمة.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BodySchema = z.object({
  message: z.string().trim().min(1).max(MAX_QUESTION_CHARS),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(20)
    .optional(),
});

/** إيقاع البث: نحو ثانية ونصف للجواب كله، بين 8 و28 مللي ثانية للكلمة. */
function wordDelay(words: number): number {
  return Math.min(28, Math.max(8, Math.round(1500 / Math.max(words, 1))));
}

/** بطاقات المصادر للجواب فقط: المشار إليها بـ [n] إن وُجدت، وإلا كل النصوص المسترجعة. */
function sourcesOf(reply: BrainReply): ChatSource[] {
  if (reply.kind !== "answer") return [];
  // النص للعرض بلا علامات الخادم («[Surah 3, …]»، «[3:1]»، «[EXACT]»، «Source: …»).
  const cards = reply.passages.map((p, i) => ({
    n: i + 1,
    title: p.title,
    text: cleanForDisplay(p.text),
    url: p.url,
    source: p.source,
    ...(p.grade ? { grade: p.grade } : {}),
    ...(p.lang ? { lang: p.lang } : {}),
    ...(p.verse ? { verse: cleanForDisplay(p.verse), note: p.note ? cleanForDisplay(p.note) : undefined, noteKind: p.noteKind } : {}),
  }));
  const cited = new Set([...reply.text.matchAll(/[\[(（]\s*(\d{1,2})\s*[\])）]/g)].map((m) => Number(m[1])));
  const picked = cards.filter((c) => cited.has(c.n));
  return picked.length ? picked : cards;
}

/** إحصاء فقط (اللغة، والمستوى، وعدد المصادر، وهل امتنع)، بلا نص السؤال. */
function logQuery(reply: BrainReply) {
  if (!isAdminClientConfigured()) return;
  after(async () => {
    const { error } = await createAdminClient()
      .from("general_queries")
      .insert({
        lang: reply.lang?.slice(0, 10) || null,
        level: reply.classification?.level ?? null,
        found_sources: reply.passages.length,
        abstained: reply.kind === "abstain" || reply.kind === "refused",
      });
    if (error) console.error("general_queries:", error.message);
  });
}

export async function POST(request: Request) {
  try {
    await requireRole(["visitor"]);
  } catch (error) {
    const res = authzResponse(error);
    if (res) return res;
    throw error;
  }

  // الطلبات من مواقع أخرى لا تستهلك حصة مُستفتي.
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });

  const limit = await checkChatRateLimit(request.headers);
  if (!limit.ok) {
    return Response.json(
      { error: limit.reason === "limited" ? "rate_limited" : "unavailable", limitPerHour: CHAT_LIMIT_PER_HOUR },
      { status: limit.reason === "limited" ? 429 : 503, headers: { "Retry-After": "3600" } },
    );
  }

  const { message, history = [] } = parsed.data;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: ChatEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false; // أغلق السائل الصفحة
        }
      };

      try {
        const reply = await respond(message, {
          history: history.slice(-MAX_HISTORY).map((h) => ({ role: h.role, content: h.content.slice(0, 1500) })),
          onStage: (stage) => send({ type: "stage", stage }),
        });
        logQuery(reply);

        send({
          type: "start",
          kind: reply.kind,
          lang: reply.lang,
          dir: dirForLang(reply.lang),
          level: reply.classification?.level,
          sources: sourcesOf(reply),
        });
        // احتياط للعرض: لا تصل علامات الخادم («[Surah …]»، «[EXACT]»، «Source: …») إلى السائل.
        const shown = reply.kind === "answer" ? cleanForDisplay(reply.text) : reply.text;
        const pieces = shown.split(/(\s+)/).filter(Boolean);
        const delay = wordDelay(pieces.length / 2);
        // كلمتان في كل حدث تقريباً: بث سلس بلا آلاف الأحداث.
        for (let i = 0; i < pieces.length && open; i += 4) {
          send({ type: "delta", text: pieces.slice(i, i + 4).join("") });
          await new Promise((r) => setTimeout(r, delay * 2));
        }
        send({ type: "done" });
      } catch (error) {
        console.error("chat:", (error as Error)?.message ?? error);
        send({ type: "error", code: "busy", text: llmUserMessage(error, guessLang(message)) });
      } finally {
        if (open) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
