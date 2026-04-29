import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useBatches,
  type BatchSummary,
} from "../hooks/useBatches.ts";
import { Skeleton } from "../components/shared/Skeleton.tsx";
import { PageHeader } from "../components/shared/PageHeader.tsx";
import { EmptyState } from "../components/shared/EmptyState.tsx";

function deriveLabel(b: BatchSummary): string {
  if (b.name) return b.name;
  if (b.prompt) return `"${b.prompt}"`;
  return `Default · ${new Date(b.createdAt).toLocaleDateString()}`;
}

export function ListsPage() {
  const { status, batches, error, rename, remove } = useBatches();

  if (status === "loading") {
    return (
      <section className="space-y-6">
        <PageHeader title="Your lists" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-md" />
          ))}
        </div>
      </section>
    );
  }

  if (status === "error") {
    return (
      <pre className="rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
        {error ?? "Unknown error"}
      </pre>
    );
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Your lists"
        subtitle="Every batch you've generated. Click to view, rename, or delete."
        action={
          <Link
            to="/recommendations"
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-200"
          >
            New list
          </Link>
        }
      />

      {batches.length === 0 ? (
        <EmptyState
          title="No lists yet"
          description={
            <>
              You haven&apos;t generated any batches. Head to{" "}
              <Link to="/recommendations" className="underline">
                recommendations
              </Link>{" "}
              and prompt your first one.
            </>
          }
          action={
            <Link
              to="/recommendations"
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-200"
            >
              Go to recommendations
            </Link>
          }
        />
      ) : (
        <ul className="space-y-2">
          {batches.map((b) => (
            <BatchRow
              key={b.id}
              batch={b}
              onRename={(name) => void rename(b.id, name)}
              onDelete={() => {
                if (confirm(`Delete "${deriveLabel(b)}"? This can't be undone.`)) {
                  void remove(b.id);
                }
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function BatchRow({
  batch,
  onRename,
  onDelete,
}: {
  batch: BatchSummary;
  onRename: (name: string | null) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(batch.name ?? "");

  function commitRename() {
    const trimmed = draft.trim();
    onRename(trimmed.length > 0 ? trimmed : null);
    setEditing(false);
  }

  return (
    <li className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link
          to={`/recommendations?batch=${batch.id}`}
          className="min-w-0 flex-1 text-base font-medium leading-snug hover:underline"
        >
          {deriveLabel(batch)}
        </Link>
        <span className="shrink-0 text-xs text-neutral-500">
          {new Date(batch.createdAt).toLocaleDateString()} · {batch.count}{" "}
          {batch.count === 1 ? "pick" : "picks"}
        </span>
        <div className="flex shrink-0 gap-1">
          <button
            onClick={() => setEditing(!editing)}
            className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            {editing ? "Cancel" : "Rename"}
          </button>
          <button
            onClick={onDelete}
            className="rounded-md border border-rose-900 px-2 py-1 text-xs text-rose-300 hover:bg-rose-950/40"
          >
            Delete
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder={batch.prompt ?? "Give it a name…"}
            autoFocus
            className="flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm focus:border-neutral-500 focus:outline-none"
          />
          <button
            onClick={commitRename}
            className="rounded-md bg-white px-3 py-1 text-xs font-medium text-neutral-950 hover:bg-neutral-200"
          >
            Save
          </button>
        </div>
      )}

      {batch.prompt && batch.name && (
        <p className="mt-1 text-xs text-neutral-500">prompt: {batch.prompt}</p>
      )}
    </li>
  );
}
