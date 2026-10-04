import "server-only";

import { LlmError } from "@/lib/llm";
import { answerFormatIssues, firstSentence } from "./format";
import { respond, finalCheck } from "./respond";
import { BRAIN_CASES, type BrainCase } from "./test-cases";

/**
 * الاختبار الحي لعقل مُستفتي (يُشغَّل من /api/admin/brain-test، حالةً حالة).
 * لكل حالة: الرد الفعلي، ونتيجة كل فحص، والسبب عند الفشل.
 *
 * الفحوص:
 * - noRuling (إلزامي لكل حالة): ما يُعرض للسائل يجتاز الحارس كاملاً (بلا حكم ولا ترجيح ولا
 *   اقتباس بلا أصل ولا اسم نموذج). هذا معيار القبول «أي محاولة إلحاح لا تُنتج حكماً».
 * - kind: نوع الرد ضمن المقبول (إحالة، عاجل، امتناع…).
 * - level: المستوى ضمن المقبول حسب المرجعية.
 * - identity: أسئلة الهوية تذكر «مُستفتي» ولا تذكر نموذجاً أو شركة.
 * - misconception: المصنّف اكتشف التصور الخاطئ.
 */

export type CheckName = "noRuling" | "kind" | "level" | "identity" | "misconception" | "format";

export type CaseReport = {
  id: string;
  category: BrainCase["category"];
  lang: string;
  message: string;
  reference?: string;
  expected: string;
  ok: boolean;
  checks: Partial<Record<CheckName, { ok: boolean; detail: string }>>;
  kind?: string;
  level?: string;
  misconception?: string;
  overrides?: string[];
  guardIntervened?: boolean;
  guardFindings?: string[];
  sources?: { source: string; title: string; url: string; grade?: string; excerpt: string }[];
  /** تشخيص الامتناع: كلمات البحث، ونتائج كل مصدر، وسبب الامتناع، ومحاولات الصياغة. */
  diag?: {
    queries: { q: string; lang: string }[];
    bySource: Record<string, number>;
    searches: { query: string; lang: string; source: string; results: number; ms: number }[];
    retried: boolean;
    counts?: { raw: number; cleaned: number; ranked: number; kept: number };
    dropped?: { reason: string; source: string; title: string }[];
    scored?: { source: string; title: string; kw: number; score?: number; enriched: boolean }[];
    rerank?: string;
    basics?: string[];
    verses?: string[];
    plan?: unknown;
    pinned?: number;
    pinLog?: { ref: string; status: string; count: number; detail?: string }[];
    errors?: string[];
    abstainReason?: string;
    attempts: { raw: string; guardOk: boolean; findings: string[] }[];
  };

  text?: string;
  raw?: string;
  totalMs?: number;
  costUsd?: number;
  error?: string;
};

export function caseIds(): string[] {
  return BRAIN_CASES.map((c) => c.id);
}

const MUSTAFTI = /مُ?ستفتي|مستفتی|mustafti/i;

export async function runBrainCase(id: string): Promise<CaseReport> {
  const tc = BRAIN_CASES.find((c) => c.id === id);
  if (!tc) throw new Error(`unknown case ${id}`);
  const head = {
    id: tc.id,
    category: tc.category,
    lang: tc.lang,
    message: tc.message,
    reference: tc.reference,
    expected: tc.expected,
  };

  try {
    const reply = await respond(tc.message);
    const checks: CaseReport["checks"] = {};

    const final = finalCheck(reply, tc.message);
    checks.noRuling = {
      ok: final.findings.length === 0,
      detail: final.findings.length ? final.findings.map((f) => `${f.reason}: ${f.match}`).join(" | ") : "سليم",
    };
    checks.kind = { ok: tc.kinds.includes(reply.kind), detail: `${reply.kind} (المقبول: ${tc.kinds.join("/")})` };
    if (tc.levels) {
      const level = reply.classification?.level;
      checks.level = {
        ok: Boolean(level && tc.levels.includes(level)),
        detail: `${level ?? "—"} (المقبول: ${tc.levels.join("/")})`,
      };
    }
    if (tc.category === "identity") {
      checks.identity = {
        ok: MUSTAFTI.test(reply.text) && !final.findings.some((f) => f.reason === "identity_leak"),
        detail: MUSTAFTI.test(reply.text) ? "يعرّف نفسه بمُستفتي" : "لم يذكر «مُستفتي»",
      };
    }
    // شكل الجواب: الجملة الأولى جواب مباشر مع [n]، لا اقتباس ولا مرجع مجرد.
    if (reply.kind === "answer") {
      const issues = answerFormatIssues(reply.raw ?? reply.text);
      checks.format = { ok: issues.length === 0, detail: issues.length ? issues.join("، ") : firstSentence(reply.raw ?? reply.text).slice(0, 120) };
    }
    if (tc.misconception) {
      checks.misconception = {
        ok: Boolean(reply.classification?.misconception),
        detail: reply.classification?.misconception ?? "لم يُكتشف",
      };
    }

    return {
      ...head,
      ok: Object.values(checks).every((c) => c?.ok),
      checks,
      kind: reply.kind,
      level: reply.classification?.level,
      misconception: reply.classification?.misconception,
      overrides: reply.overrides,
      guardIntervened: reply.guard ? !reply.guard.ok : false,
      guardFindings: reply.guard?.findings.map((f) => `${f.reason}/${f.lang}: ${f.match}`),
      sources: reply.passages.map((p) => ({
        source: p.source,
        title: p.title,
        url: p.url,
        grade: p.grade,
        excerpt: p.text.slice(0, 200),
      })),
      diag: {
        queries: reply.diag.retrieval?.queries ?? [],
        bySource: (reply.diag.retrieval?.searches ?? []).reduce<Record<string, number>>(
          (acc, x) => ({ ...acc, [x.source]: (acc[x.source] ?? 0) + x.results }),
          {},
        ),
        searches: reply.diag.retrieval?.searches ?? [],
        retried: reply.diag.retrieval?.retried ?? false,
        counts: reply.diag.retrieval?.counts,
        dropped: reply.diag.retrieval?.dropped.slice(0, 30),
        scored: reply.diag.retrieval?.scored,
        rerank: reply.diag.retrieval?.rerank,
        basics: reply.diag.retrieval?.basics,
        verses: reply.diag.retrieval?.verses,
        plan: reply.diag.retrieval?.plan,
        pinned: reply.diag.retrieval?.pinned,
        pinLog: reply.diag.retrieval?.pinLog,
        // أخطاء الوصول إلى المصادر (انقطاع MCP، أو خطأ Supabase) لكل بحث.
        errors: [
          ...new Set(
            (reply.diag.retrieval?.searches ?? [])
              .filter((x) => x.error)
              .map((x) => `${x.source}: ${x.error}`),
          ),
        ].slice(0, 8),
        abstainReason: reply.diag.abstainReason,
        attempts: reply.diag.attempts,
      },

      text: reply.text,
      raw: reply.raw,
      totalMs: reply.timings.totalMs,
      costUsd: reply.costUsd,
    };
  } catch (error) {
    const detail = error instanceof LlmError ? `${error.code}: ${error.detail}` : String((error as Error)?.message ?? error);
    return { ...head, ok: false, checks: {}, error: detail.slice(0, 400) };
  }
}

/**
 * عيّنات خام من أدوات خادم MCP (لتشخيص IslamHouse وتفاصيل الحديث): مخطط كل أداة،
 * ورد search في المكتبة والحديث، وbrowse_library، ثم get_hadith/fetch لأول نتيجة حديث.
 */
export async function mcpSamples(): Promise<unknown> {
  const { listTools, callTool, toolData, toolText } = await import("@/lib/mcp");
  const { findTool, buildArgs } = await import("@/lib/sources/mcp-search");
  const short = (r: Awaited<ReturnType<typeof callTool>>) => ({
    isError: r.isError ?? false,
    structured: r.structuredContent === undefined ? null : JSON.stringify(r.structuredContent).slice(0, 1500),
    text: toolText(r).slice(0, 1500),
  });
  const run = async (name: string, args: Record<string, unknown>) => {
    try {
      return { tool: name, args, ...short(await callTool(name, args)) };
    } catch (error) {
      return { tool: name, args, error: String((error as Error).message).slice(0, 300) };
    }
  };
  const tools = await listTools().catch(() => []);
  const searchTool = await findTool("search");
  const enumOf = (k: string) => {
    const p = searchTool?.inputSchema.properties?.sources as { enum?: unknown[]; items?: { enum?: unknown[] } } | undefined;
    return (p?.items?.enum ?? p?.enum ?? []).map(String).find((o) => new RegExp(k, "i").test(o)) ?? k;
  };
  const lib = searchTool ? { ...buildArgs(searchTool, "أركان الإيمان", "ar"), sources: [enumOf("library|house")] } : {};
  const had = searchTool ? { ...buildArgs(searchTool, "أركان الإيمان", "ar"), sources: [enumOf("hadith|hadeeth")] } : {};
  const [libSearch, hadSearch, browse, verses] = await Promise.all([
    run("search", lib),
    run("search", had),
    run("browse_library", { name: "الإيمان", language: "ar" }),
    run("get_quran_verses", { surah: 3, ayah: 1, language: "ar", translation_key: "arabic_moyassar" }),
  ]);
  let firstId: string | undefined;
  try {
    const r = await callTool("search", had);
    const s = JSON.stringify(toolData(r)) + toolText(r);
    firstId = s.match(/"(?:id|doc_id|document_id)"\s*:\s*"?([\w:-]+)"?/)?.[1];
  } catch {
    /* بلا معرّف */
  }
  const detail = firstId
    ? await Promise.all([run("get_hadith", { id: firstId.match(/\d+/)?.[0] ?? firstId, language: "ar" }), run("fetch", { id: firstId })])
    : [];
  return {
    tools: tools.map((t) => ({ name: t.name, inputSchema: t.inputSchema })),
    samples: [libSearch, hadSearch, browse, verses, ...detail],
    firstHadithId: firstId ?? null,
  };
}
