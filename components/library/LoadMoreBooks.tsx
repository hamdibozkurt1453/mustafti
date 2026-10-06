"use client";

import { useState } from "react";
import type { BookCard as Book, BookPage } from "@/lib/library/islamhouse-core";
import { BookCard } from "./BookCard";

type Labels = { pdf: string; by: string; more: string; loading: string; error: string };

/**
 * F2: «اكتشف المزيد» تحت الكتب الستة الأولى: كل ضغطة تطلب الصفحة التالية (6 كتب) من /api/library
 * بالقائمة نفسها (الافتراضية، أو التصنيف، أو البحث) وتضيفها تحتها. يختفي الزر حين لا يبقى شيء.
 */
export function LoadMoreBooks({
  initialHasMore,
  query,
  shownIds,
  labels,
}: {
  initialHasMore: boolean;
  /** lang، وtopic أو q. */
  query: Record<string, string>;
  shownIds: number[];
  labels: Labels;
}) {
  const [books, setBooks] = useState<Book[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function more() {
    setState("loading");
    try {
      const params = new URLSearchParams({ ...query, page: String(page + 1) });
      const res = await fetch(`/api/library?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as BookPage;
      const seen = new Set([...shownIds, ...books.map((b) => b.id)]);
      setBooks((prev) => [...prev, ...data.books.filter((b) => !seen.has(b.id))]);
      setPage(data.page);
      setHasMore(data.hasMore);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <>
      {books.length > 0 && (
        <ul className="mf-stagger mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((book) => (
            <BookCard key={book.id} book={book} labels={labels} />
          ))}
        </ul>
      )}
      {state === "error" && (
        <p role="alert" className="mt-4 text-center text-sm text-alert-600">
          {labels.error}
        </p>
      )}
      {hasMore && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => void more()}
            disabled={state === "loading"}
            data-testid="library-more"
            className="mf-press rounded-full border border-green-900/20 bg-white px-6 py-3 text-sm font-semibold text-green-900 hover:border-green-600 hover:bg-green-900/5 disabled:opacity-60"
          >
            {state === "loading" ? labels.loading : labels.more}
          </button>
        </div>
      )}
    </>
  );
}
