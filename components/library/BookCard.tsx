import type { BookCard as Book } from "@/lib/library/islamhouse-core";
import { GeometricPattern } from "@/components/home/GeometricPattern";

/**
 * بطاقة كتاب (F1b): غلاف كتاب ثلاثي الأبعاد بـ CSS فقط (مائل، بكعب أغمق وصفحات بيضاء وظل وحافة ذهبية).
 * وجه الكتاب صورة غلاف IslamHouse إن وُجدت، وإلا تدرج الأخضر بنقش الهيرو وعنوان الكتاب ومؤلفه.
 * ثم العنوان والمؤلف ووصف قصير، و«تحميل PDF» (أول ملف PDF) بعرض البطاقة. لا نستضيف أي ملف.
 */
export function BookCard({ book, labels }: { book: Book; labels: { pdf: string; by: string } }) {
  return (
    <li className="mf-lift mf-book-card flex flex-col overflow-hidden rounded-[24px] border border-sand-200 bg-white hover:border-green-600/40">
      <div className="mf-book-stage">
        <div className="mf-book">
          <div className="mf-book-cover">
            {book.image ? (
              // الغلاف من خادم IslamHouse (نطاق خارجي متغير)، فلا next/image.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={book.image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div aria-hidden data-testid="generated-cover" className="mf-book-generated">
                <GeometricPattern className="absolute inset-0 h-full w-full opacity-[0.16]" />
                <span dir="auto" className="relative line-clamp-3 font-display text-[17px] font-semibold leading-snug text-white">
                  {book.title}
                </span>
                {book.author && (
                  <span dir="auto" className="relative mt-2 line-clamp-1 text-[11px] text-gold-500">
                    {book.author}
                  </span>
                )}
              </div>
            )}
            <span aria-hidden className="mf-book-spine" />
          </div>
          <span aria-hidden className="mf-book-pages" />
        </div>
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
        {book.pdf && (
          <div className="mt-auto pt-4">
            <a
              href={book.pdf.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mf-press flex w-full items-center justify-center gap-2 rounded-full bg-gold-500 px-4 py-2.5 text-sm font-semibold text-green-900 hover:brightness-105"
            >
              {labels.pdf}
              <span aria-hidden>↓</span>
              {book.pdf.size && (
                <span className="text-xs font-normal opacity-75" dir="ltr">
                  {book.pdf.size}
                </span>
              )}
            </a>
          </div>
        )}
      </div>
    </li>
  );
}
