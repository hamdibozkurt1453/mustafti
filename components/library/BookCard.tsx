import type { BookCard as Book } from "@/lib/library/islamhouse-core";

/**
 * بطاقة كتاب (F1b): الغلاف (صورة IslamHouse، وإلا غلاف مولّد بتدرج الأخضر وعنوان الكتاب)، والعنوان،
 * والمؤلف، ووصف قصير، و«تحميل PDF» (أول ملف PDF) و«الصفحة في IslamHouse». لا نستضيف أي ملف.
 */
export function BookCard({ book, labels }: { book: Book; labels: { pdf: string; page: string; by: string } }) {
  return (
    <li className="mf-lift flex flex-col overflow-hidden rounded-[24px] border border-sand-200 bg-white hover:border-green-600/40">
      <div className="relative aspect-[4/3] overflow-hidden bg-green-900">
        {book.image ? (
          // الغلاف من خادم IslamHouse (نطاق خارجي متغير)، فلا next/image.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={book.image} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div
            aria-hidden
            data-testid="generated-cover"
            className="flex h-full w-full items-center justify-center p-8 text-center"
            style={{ background: "linear-gradient(145deg, #04301F 0%, #0A6B45 75%, #0A6B45 100%)" }}
          >
            <span className="absolute inset-3 rounded-[18px] border border-gold-500/40" />
            <span dir="auto" className="line-clamp-4 font-display text-xl font-semibold leading-snug text-ivory-50">
              {book.title}
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 dir="auto" className="line-clamp-3 font-semibold leading-snug text-green-900">{book.title}</h3>
        {book.author && (
          <p dir="auto" className="mt-1 line-clamp-1 text-sm text-green-600">
            {labels.by} {book.author}
          </p>
        )}
        {book.description && (
          <p dir="auto" className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-600">{book.description}</p>
        )}
        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          {book.pdf && (
            <a
              href={book.pdf.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mf-press inline-flex items-center gap-2 rounded-full bg-gold-500 px-4 py-2 text-sm font-semibold text-green-900 hover:brightness-105"
            >
              {labels.pdf}
              <span aria-hidden>↓</span>
              {book.pdf.size && (
                <span className="text-xs font-normal opacity-75" dir="ltr">
                  {book.pdf.size}
                </span>
              )}
            </a>
          )}
          <a
            href={book.pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mf-press inline-flex items-center gap-2 rounded-full bg-green-900 px-4 py-2 text-sm font-semibold text-ivory-50 hover:bg-green-600"
          >
            {labels.page}
            <span aria-hidden>↗</span>
          </a>
        </div>
      </div>
    </li>
  );
}
