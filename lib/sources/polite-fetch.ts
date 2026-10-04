import "server-only";

import { cached, DAY } from "@/lib/cache";
import { BlockedError } from "./types";

/**
 * الجلب «المؤدب» من مواقع المرجعية (الخطة 0.1 البند 4)، من الخادم فقط:
 * - المواقع المسموحة هي مواقع المرجعية وحدها (ALLOWED_HOSTS)، وأي رابط غيرها يُرفض.
 * - User-Agent واضح باسم mustafti.com.
 * - احترام robots.txt (RFC 9309) في البحث المباشر، ومعه Crawl-delay إن وُجد.
 * - طلب واحد في الثانية لكل موقع كحد أقصى.
 * - مهلة زمنية وحد لحجم الرد، ولا تُحفظ الصفحة: يستخرج المتصل المقتطف والرابط فقط.
 */

export const USER_AGENT = "MustaftiBot/1.0 (+https://mustafti.com; Islamic Q&A that cites its sources)";
const ROBOTS_AGENT = "mustaftibot";
const MIN_INTERVAL_MS = 1_000;
const MAX_CRAWL_DELAY_MS = 5_000;
const TIMEOUT_MS = 8_000;
const MAX_BYTES = 2_000_000;

/** نطاقات المرجعية (والنطاقات الفرعية لها). لا جلب لغيرها أبداً. */
export const ALLOWED_HOSTS = [
  "mcp.islamiccontent.org",
  "quranenc.com",
  "hadeethenc.com",
  "byenah.com",
  "islamhouse.com",
  "islamenc.com",
  "terminologyenc.com",
  "icadb.com",
  "risala.prh.gov.sa",
  "dawa.center",
  "islamic-content.com",
  "quranpedia.net",
  "qurancomplex.gov.sa",
  "dorar.net",
  "shamela.ws",
  "tafsir.net",
  "modoee.com",
  "surahapp.com",
  "wahy.net",
  "mp3quran.net",
  "awqaf.gov.kw",
  "islamqa.info",
  "binbaz.org.sa",
  "binothaimeen.net",
  "ksaa.gov.sa",
] as const;

export function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

// ---------------------------------------------------------------------------
// تنظيم الإيقاع: طلب واحد في الثانية لكل موقع (داخل نسخة الخادم)
// ---------------------------------------------------------------------------

const nextSlot = new Map<string, number>();

async function waitTurn(host: string, intervalMs: number): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextSlot.get(host) ?? 0);
  nextSlot.set(host, slot + intervalMs);
  if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
}

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------

type Rule = { allow: boolean; path: string };
type Robots = { rules: Rule[]; crawlDelayMs: number; disallowAll: boolean };

/** يحلل robots.txt ويأخذ مجموعة mustaftibot إن وُجدت، وإلا مجموعة *. */
export function parseRobots(text: string): Robots {
  const groups: { agents: string[]; rules: Rule[]; delay: number }[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const field = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], delay: 0 };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === "allow" || field === "disallow") {
      if (value) current.rules.push({ allow: field === "allow", path: value });
    } else if (field === "crawl-delay") {
      const n = Number(value);
      if (Number.isFinite(n)) current.delay = n * 1000;
    }
  }

  const own = groups.filter((g) => g.agents.includes(ROBOTS_AGENT));
  const chosen = own.length ? own : groups.filter((g) => g.agents.includes("*"));
  return {
    rules: chosen.flatMap((g) => g.rules),
    crawlDelayMs: Math.max(0, ...chosen.map((g) => g.delay)),
    disallowAll: false,
  };
}

function patternToRegex(path: string): RegExp {
  const anchored = path.endsWith("$");
  const body = (anchored ? path.slice(0, -1) : path)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

/** القاعدة الأطول تطابقاً تحكم، وعند التساوي Allow تغلب (RFC 9309). */
export function robotsAllows(robots: Robots, pathAndQuery: string): boolean {
  if (robots.disallowAll) return false;
  let best: Rule | null = null;
  for (const rule of robots.rules) {
    if (!patternToRegex(rule.path).test(pathAndQuery)) continue;
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

async function getRobots(origin: string): Promise<Robots> {
  return cached(`robots:${origin}`, DAY, async () => {
    const host = new URL(origin).hostname;
    await waitTurn(host, MIN_INTERVAL_MS);
    let res: Response;
    try {
      res = await fetch(`${origin}/robots.txt`, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "follow",
        cache: "no-store",
      });
    } catch (error) {
      // تعذّر الوصول: لا نعرف القواعد، فلا نزحف (RFC 9309: «غير قابل للوصول» = منع كامل).
      throw new Error(`robots.txt unreachable: ${(error as Error).message}`);
    }
    if (res.status >= 500) return { rules: [], crawlDelayMs: 0, disallowAll: true };
    if (res.status >= 400) return { rules: [], crawlDelayMs: 0, disallowAll: false }; // لا ملف = مسموح
    return parseRobots((await res.text()).slice(0, 500_000));
  });
}

// ---------------------------------------------------------------------------
// الجلب
// ---------------------------------------------------------------------------

export type PoliteFetchOptions = {
  /** البحث المباشر في الموقع: يُفحص robots.txt. واجهات API العامة الموثقة لا تحتاجه. */
  respectRobots: boolean;
  accept?: string;
};

const CHALLENGE = /cf-chl|challenge-platform|captcha|Attention Required|Just a moment\.\.\./i;

async function readLimited(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** يجلب الرابط بأدب ويعيد النص. يرمي BlockedError إن كان محجوباً، وError لغير ذلك. */
export async function politeFetch(url: string, options: PoliteFetchOptions): Promise<{ status: number; text: string; finalUrl: string }> {
  const target = new URL(url);
  if (target.protocol !== "https:" && target.protocol !== "http:") throw new Error("unsupported protocol");
  if (!isAllowedHost(target.hostname)) throw new BlockedError(`host outside the reference list: ${target.hostname}`);

  let interval = MIN_INTERVAL_MS;
  if (options.respectRobots) {
    const robots = await getRobots(target.origin);
    if (!robotsAllows(robots, target.pathname + target.search)) {
      throw new BlockedError("disallowed by robots.txt");
    }
    interval = Math.min(Math.max(MIN_INTERVAL_MS, robots.crawlDelayMs), MAX_CRAWL_DELAY_MS);
  }

  await waitTurn(target.hostname, interval);
  const res = await fetch(target, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: options.accept ?? "text/html,application/json;q=0.9,*/*;q=0.5",
      "Accept-Language": "ar,en;q=0.8",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "follow",
    cache: "no-store",
  });

  const finalHost = new URL(res.url || url).hostname;
  if (!isAllowedHost(finalHost)) throw new BlockedError(`redirected outside the reference list: ${finalHost}`);
  if ([401, 403, 429, 451].includes(res.status)) throw new BlockedError(`HTTP ${res.status}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const text = await readLimited(res);
  if (CHALLENGE.test(text.slice(0, 5000)) && !text.includes("<article")) {
    throw new BlockedError("bot challenge page");
  }
  return { status: res.status, text, finalUrl: res.url || url };
}

/** جلب JSON من واجهة عامة موثقة (بلا مفتاح). */
export async function politeJson<T = unknown>(url: string): Promise<T> {
  const { text } = await politeFetch(url, { respectRobots: false, accept: "application/json" });
  return JSON.parse(text) as T;
}
