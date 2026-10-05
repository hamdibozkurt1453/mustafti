/** أثناء البحث في المكتبة: هيكل بطاقات خافت (يتوقف وميضه مع prefers-reduced-motion). */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:py-14" aria-busy="true">
      <div className="h-64 rounded-[32px] bg-green-900/90 motion-safe:animate-pulse" />
      <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="h-44 rounded-[24px] border border-sand-200 bg-white motion-safe:animate-pulse" />
        ))}
      </ul>
    </main>
  );
}
