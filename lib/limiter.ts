/**
 * أدوات نقية لحماية خادم MCP من الضغط (تُختبر محلياً):
 * - createLimiter: حد للطلبات المتزامنة، والباقي ينتظر دوره بالترتيب.
 * - retryDelayMs / withRetry: إعادة المحاولة عند 429 (Retry-After إن وُجد، وإلا 1 ثم 2 ثانية).
 */

export type Limiter = (<T>(job: () => Promise<T>) => Promise<T>) & { active: () => number; waiting: () => number };

export function createLimiter(max: number): Limiter {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (active >= max) return;
    const start = queue.shift();
    if (start) {
      active += 1;
      start();
    }
  };
  const run = <T>(job: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        job()
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            next();
          });
      });
      next();
    });
  return Object.assign(run, { active: () => active, waiting: () => queue.length });
}

/** مهلة الانتظار قبل المحاولة رقم attempt (من 1): Retry-After بالثواني أو بتاريخ، وإلا 1s ثم 2s. */
export function retryDelayMs(attempt: number, retryAfter?: string | null, now = Date.now()): number {
  const fallback = 1000 * attempt;
  if (!retryAfter) return fallback;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 5_000);
  const at = Date.parse(retryAfter);
  return Number.isFinite(at) ? Math.max(0, Math.min(at - now, 5_000)) : fallback;
}

export const RATE_LIMITED = /\b429\b|rate.?limit|too many requests/i;

/** ينفذ job ويعيده حتى retries مرات إن كان الخطأ «429 / rate limit». */
export async function withRetry<T>(
  job: () => Promise<T>,
  { retries = 2, sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await job();
    } catch (error) {
      const msg = String((error as Error)?.message ?? error);
      if (attempt >= retries || !RATE_LIMITED.test(msg)) throw error;
      await sleep(retryDelayMs(attempt + 1, (error as { retryAfter?: string }).retryAfter));
    }
  }
}

/** fetch يعيد الطلب عند رد HTTP 429 (حتى retries مرات) باحترام Retry-After. */
export function retryingFetch(base: typeof fetch = fetch, retries = 2, sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    for (let attempt = 0; ; attempt++) {
      const res = await base(input, init);
      if (res.status !== 429 || attempt >= retries) return res;
      await res.body?.cancel().catch(() => {});
      await sleep(retryDelayMs(attempt + 1, res.headers.get("retry-after")));
    }
  }) as typeof fetch;
}
