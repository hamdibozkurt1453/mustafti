/** F3: رأس قسم بهوية الموقع: سطر صغير ذهبي، وعنوان، ووصف. */
export function SectionHead({ kicker, title, lead }: { kicker: string; title: string; lead?: string }) {
  return (
    <div>
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-green-600">
        <svg aria-hidden viewBox="0 0 20 20" className="h-3 w-3 text-gold-500">
          <path fill="currentColor" d="M10 0l2.5 7.5L20 10l-7.5 2.5L10 20l-2.5-7.5L0 10l7.5-2.5z" />
        </svg>
        {kicker}
      </p>
      <h2 className="mt-2 font-display text-[26px] font-semibold leading-tight text-green-900 sm:text-[32px]">{title}</h2>
      {lead && <p className="mt-2 max-w-2xl leading-relaxed text-ink-600">{lead}</p>}
    </div>
  );
}
