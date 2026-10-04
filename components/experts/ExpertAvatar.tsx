/** صورة المختص في دائرة، أو أول حرف من اسمه إن لم تكن له صورة. */
export function ExpertAvatar({ url, name, size = 96 }: { url: string | null; name: string; size?: number }) {
  const initial = name.trim().charAt(0) || "؟";
  return url ? (
    // الصورة من المخزن العام في Supabase (نطاق متغير)، فلا next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={name}
      width={size}
      height={size}
      loading="lazy"
      className="shrink-0 rounded-full border-2 border-gold-500 bg-ivory-50 object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full border-2 border-gold-500 bg-green-900 font-bold text-ivory-50"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initial}
    </span>
  );
}
