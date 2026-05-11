import { Link } from "react-router-dom";

export function QuickLinks() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <QuickLink
        to="/watchlist"
        title="Watchlist"
        description="Your plan-to list, sortable by mood."
        icon={
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 3h14a1 1 0 0 1 1 1v17l-8-5-8 5V4a1 1 0 0 1 1-1Z" />
          </svg>
        }
      />
      <QuickLink
        to="/evaluate"
        title="Would I like…?"
        description="Honest verdict on a specific title."
        icon={
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4.3-4.3" />
          </svg>
        }
      />
      <QuickLink
        to="/recommendations"
        title="All recommendations"
        description="Every batch, filterable by format."
        icon={
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        }
      />
      <QuickLink
        to="/batches"
        title="Batches"
        description="Rename and organize your batches."
        icon={
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 6h13" />
            <path d="M8 12h13" />
            <path d="M8 18h13" />
            <circle cx="3.5" cy="6" r="1" />
            <circle cx="3.5" cy="12" r="1" />
            <circle cx="3.5" cy="18" r="1" />
          </svg>
        }
      />
    </div>
  );
}

function QuickLink({
  to,
  title,
  description,
  icon,
}: {
  to: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="group flex items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4 transition-all hover:-translate-y-0.5 hover:border-emerald-700 hover:bg-emerald-950/10"
    >
      <span
        aria-hidden
        className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-neutral-700 bg-neutral-950 text-neutral-300 group-hover:border-emerald-700 group-hover:text-emerald-300"
      >
        <span className="block h-4 w-4">{icon}</span>
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-neutral-100 group-hover:text-white">
          {title}
        </span>
        <span className="mt-1 block text-xs text-neutral-500">
          {description}
        </span>
      </span>
    </Link>
  );
}
