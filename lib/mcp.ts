import "server-only";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { cached, DAY, HOUR } from "@/lib/cache";

/**
 * عميل خادم MCP الرسمي للجمعية (MCP_URL، بلا مفتاح) عبر Streamable HTTP.
 * - اتصال واحد يُعاد استعماله داخل نسخة الخادم، ويُعاد إنشاؤه تلقائياً عند انقطاعه.
 * - مهلة لكل طلب، وذاكرة مؤقتة: قائمة الأدوات ساعة، ونتائج الأدوات 24 ساعة.
 */

const DEFAULT_URL = "https://mcp.islamiccontent.org/mcp";
const CONNECT_TIMEOUT_MS = 8_000;
/** بحث الخادم قد يستغرق أكثر من 10 ثوانٍ؛ المهلة القصوى لكل مصدر (6 ثوانٍ) تُطبَّق في lib/sources. */
const CALL_TIMEOUT_MS = 20_000;

export type McpTool = {
  name: string;
  description?: string;
  inputSchema: { type?: string; properties?: Record<string, { type?: string; description?: string; enum?: unknown[] }>; required?: string[] };
};

export type McpContent = { type: string; text?: string; [key: string]: unknown };
export type McpToolResult = { content: McpContent[]; structuredContent?: unknown; isError?: boolean };

export function mcpUrl(): string {
  return (process.env.MCP_URL ?? "").trim() || DEFAULT_URL;
}

let clientPromise: Promise<Client> | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}: timeout after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function connect(): Promise<Client> {
  const client = new Client({ name: "mustafti", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl()), {
    requestInit: { headers: { "User-Agent": "MustaftiBot/1.0 (+https://mustafti.com)" } },
  });
  client.onerror = () => reset();
  transport.onclose = () => reset();
  await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, "mcp connect");
  return client;
}

function reset() {
  const old = clientPromise;
  clientPromise = null;
  old?.then((c) => c.close()).catch(() => {});
}

async function getClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = connect().catch((error) => {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}

/**
 * ينفذ عملية على العميل، ويعيد الاتصال مرة واحدة إن انتهت الجلسة أو انقطع الاتصال.
 * انتهاء المهلة لا يُعاد (إعادته تضاعف الانتظار فقط).
 */
async function withClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
  try {
    return await run(await getClient());
  } catch (error) {
    if (/timed? ?out|timeout/i.test(String((error as Error)?.message ?? error))) throw error;
    reset();
    return run(await getClient());
  }
}

/** قائمة أدوات الخادم (ساعة في الذاكرة). */
export function listTools(): Promise<McpTool[]> {
  return cached(`mcp:tools:${mcpUrl()}`, HOUR, async () => {
    const res = await withClient((c) => c.listTools(undefined, { timeout: CALL_TIMEOUT_MS }));
    return res.tools as McpTool[];
  });
}

/**
 * يستدعي أداة. النتيجة تُخزَّن 24 ساعة بمفتاح (الأداة + المعطيات)، ما لم تكن خطأ.
 * cacheTtlMs = 0 يلغي الذاكرة المؤقتة.
 */
export async function callTool(
  name: string,
  args: Record<string, unknown> = {},
  options: { timeoutMs?: number; cacheTtlMs?: number } = {},
): Promise<McpToolResult> {
  const run = async () => {
    const res = (await withClient((c) =>
      c.callTool({ name, arguments: args }, undefined, { timeout: options.timeoutMs ?? CALL_TIMEOUT_MS }),
    )) as McpToolResult;
    if (res.isError) throw new Error(`mcp tool ${name} error: ${toolText(res).slice(0, 200)}`);
    return res;
  };
  const ttl = options.cacheTtlMs ?? DAY;
  if (ttl <= 0) return run();
  return cached(`mcp:call:${name}:${JSON.stringify(args)}`, ttl, run);
}

/** نص نتيجة الأداة (كل أجزاء text مجموعة). */
export function toolText(result: McpToolResult): string {
  return result.content
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("\n");
}

/** البيانات المنظمة للنتيجة: structuredContent إن وُجد، وإلا JSON داخل النص إن أمكن. */
export function toolData(result: McpToolResult): unknown {
  if (result.structuredContent !== undefined) return result.structuredContent;
  const text = toolText(result).trim();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export type McpHealth = { ok: boolean; url: string; latencyMs: number | null; tools: McpTool[]; error?: string };

/** حالة الخادم وقائمة أدواته (لـ /api/health). */
export async function mcpHealth(): Promise<McpHealth> {
  const started = Date.now();
  try {
    const tools = await listTools();
    return { ok: true, url: mcpUrl(), latencyMs: Date.now() - started, tools };
  } catch (error) {
    return { ok: false, url: mcpUrl(), latencyMs: null, tools: [], error: String((error as Error)?.message ?? error) };
  }
}
