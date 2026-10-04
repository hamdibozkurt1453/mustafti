import "server-only";

/**
 * ذاكرة مؤقتة بسيطة بمدة صلاحية (TTL) داخل نسخة الخادم.
 * تُخزَّن فيها نتائج مستخرجة صغيرة فقط (مقتطفات وروابط وقوائم أدوات)، لا صفحات كاملة.
 * Vercel يُبقي النسخة دافئة بين الطلبات، فتكفي لتخفيف الطلبات على المصادر.
 */
type Entry = { value: unknown; expires: number };

const MAX_ENTRIES = 2000;
const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

export function cacheGet<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    store.delete(key);
    return undefined;
  }
  // إعادة الإدراج تجعل الأحدث استعمالاً في آخر الترتيب (LRU تقريبي).
  store.delete(key);
  store.set(key, hit);
  return hit.value as T;
}

export function cacheSet(key: string, value: unknown, ttlMs: number): void {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { value, expires: Date.now() + ttlMs });
}

/**
 * يعيد القيمة من الذاكرة أو يحسبها مرة واحدة (الطلبات المتزامنة بنفس المفتاح تنتظر الحساب نفسه).
 * الأخطاء لا تُخزَّن: الفشل يُعاد في الطلب التالي.
 */
export async function cached<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = compute()
    .then((value) => {
      cacheSet(key, value, ttlMs);
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
