export function SectionCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string | null;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-neutral-200">
              {subtitle}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      {children}
    </article>
  );
}
