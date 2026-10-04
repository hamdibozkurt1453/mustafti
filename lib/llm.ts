import "server-only";

import { z } from "zod";
import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";

/**
 * طبقة النموذج اللغوي: عميل OpenRouter (واجهة متوافقة مع OpenAI) عبر fetch مباشرة.
 *
 * - النموذج من LLM_MODEL، والمفتاح من OPENROUTER_API_KEY (Vercel فقط).
 * - chat(): جواب كامل. chatStream(): بث كلمة بكلمة. chatJson(): JSON مضبوط بمخطط Zod.
 * - مهلة زمنية، وإعادة محاولة عند 429 و5xx وانقطاع الشبكة، وعدّاد يومي يتوقف عند DAILY_LLM_LIMIT.
 *
 * الهوية (الخطة 0.5): لا يصل إلى المستخدم أي نص يذكر اسم النموذج أو الشركة.
 * لذلك كل خطأ يُرمى من نوع LlmError، ولا يُعرض للمستخدم منه إلا userMessage(lang)،
 * وهي رسائل ثابتة مكتوبة هنا. تفاصيل الخطأ الفنية (detail) للسجلات فقط.
 */

const ENDPOINT = "https://openrouter.ai/api/v1";
const DEFAULT_TIMEOUT_MS = 30_000;
const STREAM_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 2;
const DAILY_KEY = "llm:daily";
const DAY_SECONDS = 86_400;

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type LlmOptions = {
  /** يتجاوز LLM_MODEL (لاختبار المقارنة بين النماذج فقط). */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** مهلة الطلب بالمللي ثانية (للبث: حتى وصول أول رد من الخادم). */
  timeoutMs?: number;
  /** عدد مرات إعادة المحاولة بعد الفشل المؤقت. */
  retries?: number;
  signal?: AbortSignal;
};

export type LlmUsage = {
  promptTokens: number;
  completionTokens: number;
  /** التكلفة بالدولار كما يحسبها OpenRouter (إن توفرت). */
  costUsd: number | null;
};

export type LlmResult = { text: string; usage: LlmUsage; latencyMs: number };

export type LlmErrorCode =
  | "not_configured"
  | "daily_limit"
  | "timeout"
  | "rate_limited"
  | "unavailable"
  | "bad_request"
  | "bad_output";

/** رسائل لطيفة للمستخدم، بلا أي ذكر لنموذج أو شركة. */
const USER_MESSAGES: Record<"daily_limit" | "busy", Record<string, string>> = {
  daily_limit: {
    ar: "بلغ مُستفتي حدّه اليومي من الأسئلة، ويعود غداً بإذن الله. يمكنك الآن إرسال سؤالك الشخصي إلى مختص، أو تصفح المواقيت والأذكار.",
    en: "Mustafti has reached its daily question limit and will be back tomorrow, God willing. Meanwhile you can send your personal question to a specialist, or browse prayer times and adhkar.",
    tr: "Mustafti günlük soru sınırına ulaştı, inşallah yarın tekrar hizmetinizde olacak. Bu arada kişisel sorunuzu bir uzmana gönderebilirsiniz.",
    fr: "Mustafti a atteint sa limite quotidienne de questions et sera de retour demain, si Dieu le veut. Vous pouvez en attendant envoyer votre question personnelle à un spécialiste.",
    ur: "مستفتی آج کے سوالات کی حد تک پہنچ گیا ہے، ان شاء اللہ کل دوبارہ حاضر ہوگا۔ اس دوران آپ اپنا ذاتی سوال کسی ماہر کو بھیج سکتے ہیں۔",
    id: "Mustafti telah mencapai batas pertanyaan harian dan akan kembali besok, insya Allah. Sementara itu Anda dapat mengirim pertanyaan pribadi Anda kepada seorang ahli.",
  },
  busy: {
    ar: "مُستفتي مشغول الآن، أعد المحاولة بعد قليل من فضلك.",
    en: "Mustafti is busy right now. Please try again in a moment.",
    tr: "Mustafti şu anda meşgul. Lütfen birazdan tekrar deneyin.",
    fr: "Mustafti est occupé pour le moment. Veuillez réessayer dans un instant.",
    ur: "مستفتی اس وقت مصروف ہے، براہِ کرم کچھ دیر بعد دوبارہ کوشش کریں۔",
    id: "Mustafti sedang sibuk. Silakan coba lagi sebentar lagi.",
  },
};

function pickMessage(kind: keyof typeof USER_MESSAGES, lang = "ar"): string {
  const base = lang.toLowerCase().split(/[-_]/)[0];
  return USER_MESSAGES[kind][base] ?? USER_MESSAGES[kind].en;
}

export class LlmError extends Error {
  constructor(
    public readonly code: LlmErrorCode,
    /** تفاصيل فنية للسجلات فقط، لا تُعرض للمستخدم. */
    public readonly detail = "",
    public readonly status?: number,
  ) {
    super(`llm:${code}`);
    this.name = "LlmError";
  }

  /** النص الوحيد الذي يجوز عرضه للمستخدم. */
  userMessage(lang = "ar"): string {
    return pickMessage(this.code === "daily_limit" ? "daily_limit" : "busy", lang);
  }

  get retryable(): boolean {
    return this.code === "timeout" || this.code === "rate_limited" || this.code === "unavailable";
  }
}

/** رسالة المستخدم لأي خطأ (حتى غير المتوقع)، بلا تفاصيل فنية. */
export function llmUserMessage(error: unknown, lang = "ar"): string {
  return error instanceof LlmError ? error.userMessage(lang) : pickMessage("busy", lang);
}

// ---------------------------------------------------------------------------
// الإعداد
// ---------------------------------------------------------------------------

export function llmModel(): string {
  return (process.env.LLM_MODEL ?? "").trim();
}

export function isLlmConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY && llmModel());
}

export function dailyLimit(): number {
  const n = Number(process.env.DAILY_LLM_LIMIT ?? "1500");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1500;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ""}`,
    "Content-Type": "application/json",
    // تعريف التطبيق في OpenRouter (اختياري).
    "HTTP-Referer": "https://mustafti.com",
    "X-Title": "Mustafti",
  };
}

// ---------------------------------------------------------------------------
// العدّاد اليومي (يوم UTC). مشترك بين نسخ الخادم عبر Supabase، وفي الذاكرة إن لم تُعدّ.
// ---------------------------------------------------------------------------

const memoryCounter = { day: "", count: 0 };

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

/** يحجز طلباً واحداً من حصة اليوم، ويرمي daily_limit إن نفدت. */
async function consumeDailyQuota(): Promise<void> {
  const limit = dailyLimit();
  if (isAdminClientConfigured()) {
    const { data, error } = await createAdminClient().rpc("hit_rate_limit", {
      p_key: DAILY_KEY,
      p_limit: limit,
      p_window_seconds: DAY_SECONDS,
    });
    if (!error) {
      if (data !== true) throw new LlmError("daily_limit");
      return;
    }
    console.error("llm daily counter:", error.message);
    // عند تعذّر القاعدة نكمل بعداد الذاكرة بدل إيقاف الخدمة.
  }
  const day = utcDay();
  if (memoryCounter.day !== day) Object.assign(memoryCounter, { day, count: 0 });
  memoryCounter.count += 1;
  if (memoryCounter.count > limit) throw new LlmError("daily_limit");
}

/** استهلاك اليوم (لصفحة /api/health). */
export async function getDailyUsage(): Promise<{ used: number; limit: number; shared: boolean }> {
  const limit = dailyLimit();
  if (isAdminClientConfigured()) {
    const windowStart = new Date(Math.floor(Date.now() / 1000 / DAY_SECONDS) * DAY_SECONDS * 1000).toISOString();
    const { data, error } = await createAdminClient()
      .from("rate_limits")
      .select("count")
      .eq("key", DAILY_KEY)
      .eq("window_start", windowStart)
      .maybeSingle();
    if (!error) return { used: data?.count ?? 0, limit, shared: true };
  }
  return { used: memoryCounter.day === utcDay() ? memoryCounter.count : 0, limit, shared: false };
}

// ---------------------------------------------------------------------------
// الطلب الأساسي: مهلة + إعادة محاولة
// ---------------------------------------------------------------------------

type Body = Record<string, unknown>;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function classifyStatus(status: number, detail: string): LlmError {
  if (status === 429) return new LlmError("rate_limited", detail, status);
  if (status === 408) return new LlmError("timeout", detail, status);
  if (status >= 500) return new LlmError("unavailable", detail, status);
  return new LlmError("bad_request", detail, status);
}

/** يرسل الطلب ويعيد الرد بعد التأكد من نجاحه، مع المهلة وإعادة المحاولة. */
async function post(body: Body, opts: LlmOptions): Promise<Response> {
  if (!isLlmConfigured()) throw new LlmError("not_configured", "OPENROUTER_API_KEY or LLM_MODEL missing");
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastError: LlmError = new LlmError("unavailable");

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(600 * 2 ** (attempt - 1) + Math.random() * 300);
    const signals = [AbortSignal.timeout(timeoutMs)];
    if (opts.signal) signals.push(opts.signal);
    try {
      const res = await fetch(`${ENDPOINT}/chat/completions`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.any(signals),
        cache: "no-store",
      });
      if (res.ok) return res;
      const detail = (await res.text().catch(() => "")).slice(0, 500);
      lastError = classifyStatus(res.status, detail);
    } catch (error) {
      if (opts.signal?.aborted) throw new LlmError("timeout", "aborted by caller");
      const name = (error as Error)?.name;
      lastError =
        name === "TimeoutError" || name === "AbortError"
          ? new LlmError("timeout", `no response in ${timeoutMs}ms`)
          : new LlmError("unavailable", String((error as Error)?.message ?? error));
    }
    if (!lastError.retryable) break;
  }
  throw lastError;
}

function baseBody(messages: ChatMessage[], opts: LlmOptions): Body {
  return {
    model: opts.model ?? llmModel(),
    messages,
    temperature: opts.temperature ?? 0.2,
    ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
    // OpenRouter يعيد عدد الرموز والتكلفة في usage.
    usage: { include: true },
  };
}

type RawUsage = { prompt_tokens?: number; completion_tokens?: number; cost?: number } | undefined;

function toUsage(u: RawUsage): LlmUsage {
  return {
    promptTokens: u?.prompt_tokens ?? 0,
    completionTokens: u?.completion_tokens ?? 0,
    costUsd: typeof u?.cost === "number" ? u.cost : null,
  };
}

async function complete(body: Body, opts: LlmOptions): Promise<LlmResult> {
  const started = Date.now();
  const res = await post(body, opts);
  const json = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string | null } }[];
    usage?: RawUsage;
    error?: { message?: string };
  } | null;
  if (!json || json.error) throw new LlmError("unavailable", json?.error?.message ?? "invalid JSON response");
  const text = json.choices?.[0]?.message?.content ?? "";
  return { text, usage: toUsage(json.usage), latencyMs: Date.now() - started };
}

// ---------------------------------------------------------------------------
// الواجهة العامة
// ---------------------------------------------------------------------------

/** جواب نصي كامل. */
export async function chat(messages: ChatMessage[], opts: LlmOptions = {}): Promise<LlmResult> {
  await consumeDailyQuota();
  return complete(baseBody(messages, opts), opts);
}

export type StreamDone = { usage: LlmUsage; latencyMs: number };

/**
 * بث الجواب: مولّد يعطي أجزاء النص بالترتيب، ويعيد في نهايته الاستهلاك.
 *   for await (const piece of chatStream(messages)) send(piece)
 * إعادة المحاولة تتم قبل وصول أول جزء فقط؛ وبعدها أي انقطاع يُرمى LlmError.
 */
export async function* chatStream(
  messages: ChatMessage[],
  opts: LlmOptions = {},
): AsyncGenerator<string, StreamDone, void> {
  await consumeDailyQuota();
  const started = Date.now();
  const res = await post({ ...baseBody(messages, opts), stream: true }, opts);
  if (!res.body) throw new LlmError("unavailable", "empty stream");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let usage: LlmUsage = toUsage(undefined);

  try {
    while (true) {
      let idle: ReturnType<typeof setTimeout> | undefined;
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          idle = setTimeout(() => reject(new LlmError("timeout", "stream idle")), STREAM_IDLE_TIMEOUT_MS);
        }),
      ]).finally(() => clearTimeout(idle));
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });

      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        // أسطر التعليق (": OPENROUTER PROCESSING") للإبقاء على الاتصال فقط.
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return { usage, latencyMs: Date.now() - started };
        let event: {
          choices?: { delta?: { content?: string | null } }[];
          usage?: RawUsage;
          error?: { message?: string };
        };
        try {
          event = JSON.parse(data);
        } catch {
          continue;
        }
        if (event.error) throw new LlmError("unavailable", event.error.message ?? "stream error");
        if (event.usage) usage = toUsage(event.usage);
        const piece = event.choices?.[0]?.delta?.content;
        if (piece) yield piece;
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return { usage, latencyMs: Date.now() - started };
}

export type JsonResult<T> = LlmResult & {
  data: T;
  /** strict: التزم بالمخطط من أول مرة · repaired: احتاج تصحيحاً · fallback: وضع json_object بدل json_schema. */
  mode: "strict" | "repaired" | "fallback";
};

/** يستخرج كائن JSON من نص قد يحيط به كلام أو ```json. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("no JSON object found");
  }
}

/**
 * جواب JSON مضبوط بمخطط Zod.
 * 1) response_format = json_schema (strict) مع require_parameters، فلا يُوجَّه الطلب
 *    إلا لمزوّد يدعم المخطط.
 * 2) إن لم يدعمه أي مزوّد: json_object مع المخطط في التعليمات.
 * 3) إن خالف الناتج المخطط: محاولة تصحيح واحدة بذكر الأخطاء.
 * الحصة اليومية تُحسب مرة واحدة للطلب كله.
 */
export async function chatJson<T>(
  messages: ChatMessage[],
  schema: z.ZodType<T>,
  opts: LlmOptions & { schemaName?: string } = {},
): Promise<JsonResult<T>> {
  await consumeDailyQuota();
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  delete jsonSchema.$schema;
  const name = (opts.schemaName ?? "response").replace(/[^a-zA-Z0-9_-]/g, "_");

  const strictBody: Body = {
    ...baseBody(messages, opts),
    response_format: { type: "json_schema", json_schema: { name, strict: true, schema: jsonSchema } },
    provider: { require_parameters: true },
  };

  let mode: JsonResult<T>["mode"] = "strict";
  let first: LlmResult;
  try {
    first = await complete(strictBody, opts);
  } catch (error) {
    // 400/404: لا يوجد مزوّد يدعم json_schema لهذا النموذج ⇒ وضع json_object.
    if (!(error instanceof LlmError) || error.code !== "bad_request") throw error;
    mode = "fallback";
    const hint: ChatMessage = {
      role: "system",
      content: `Reply with a single JSON object only, no prose, matching this JSON Schema:\n${JSON.stringify(jsonSchema)}`,
    };
    first = await complete(
      { ...baseBody([...messages, hint], opts), response_format: { type: "json_object" } },
      opts,
    );
  }

  const parsed = tryParse(first.text, schema);
  if (parsed.ok) return { ...first, data: parsed.data, mode };

  // محاولة تصحيح واحدة.
  const repair = await complete(
    {
      ...baseBody(
        [
          ...messages,
          { role: "assistant", content: first.text },
          {
            role: "user",
            content: `Your previous reply did not match the required JSON Schema (${parsed.error}). Reply again with the corrected JSON object only.`,
          },
        ],
        opts,
      ),
      response_format: { type: "json_object" },
    },
    opts,
  );
  const second = tryParse(repair.text, schema);
  const usage: LlmUsage = {
    promptTokens: first.usage.promptTokens + repair.usage.promptTokens,
    completionTokens: first.usage.completionTokens + repair.usage.completionTokens,
    costUsd:
      first.usage.costUsd === null && repair.usage.costUsd === null
        ? null
        : (first.usage.costUsd ?? 0) + (repair.usage.costUsd ?? 0),
  };
  if (!second.ok) throw new LlmError("bad_output", second.error);
  return { text: repair.text, usage, latencyMs: first.latencyMs + repair.latencyMs, data: second.data, mode: "repaired" };
}

function tryParse<T>(text: string, schema: z.ZodType<T>): { ok: true; data: T } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch {
    return { ok: false, error: "not valid JSON" };
  }
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 400) };
}

// ---------------------------------------------------------------------------
// الحالة (لـ /api/health): بلا توليد، فلا تستهلك رصيداً ولا من الحصة اليومية.
// ---------------------------------------------------------------------------

export type LlmHealth = {
  configured: boolean;
  keyValid: boolean | null;
  modelAvailable: boolean | null;
  latencyMs: number | null;
  error?: string;
};

export async function llmHealth(): Promise<LlmHealth> {
  if (!isLlmConfigured()) {
    return { configured: false, keyValid: null, modelAvailable: null, latencyMs: null, error: "OPENROUTER_API_KEY / LLM_MODEL" };
  }
  const started = Date.now();
  try {
    const [key, models] = await Promise.all([
      fetch(`${ENDPOINT}/key`, { headers: headers(), signal: AbortSignal.timeout(8000), cache: "no-store" }),
      fetch(`${ENDPOINT}/models`, { signal: AbortSignal.timeout(8000), cache: "no-store" }),
    ]);
    const list = models.ok ? ((await models.json()) as { data?: { id: string }[] }).data ?? [] : [];
    return {
      configured: true,
      keyValid: key.ok,
      modelAvailable: models.ok ? list.some((m) => m.id === llmModel()) : null,
      latencyMs: Date.now() - started,
      error: key.ok ? undefined : `key check HTTP ${key.status}`,
    };
  } catch (error) {
    return {
      configured: true,
      keyValid: null,
      modelAvailable: null,
      latencyMs: null,
      error: String((error as Error)?.message ?? error),
    };
  }
}
