/** فقاعة مُستفتي الذهبية (من brand/icon-mark.svg) تتنفس، ونقاطها الثلاث تتموج كأنها تكتب. */
export function BubbleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="160 150 680 680" className={className} aria-hidden focusable="false">
      <g className="mf-breathe">
        <circle cx="500" cy="470" r="300" fill="var(--mf-gold-500)" />
        <path fill="var(--mf-gold-500)" d="M772,597 L794,806 L603,752Z" />
        {[371, 500, 629].map((cx, i) => (
          <circle
            key={cx}
            cx={cx}
            cy="470"
            r="44"
            fill="var(--mf-green-900)"
            className="mf-dot"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </g>
    </svg>
  );
}
