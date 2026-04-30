import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../../hooks/useApi.ts";

const STARTER_PROMPTS = [
  "A book that'll wreck me",
  "Slow burns I'll think about for weeks",
  "Old anime curated to my taste",
  "Games for a rainy weekend",
  "A movie that earns its ending",
];

/**
 * Multi-line prompt input with auto-grow and starter-prompt chips. Submit POSTs
 * to /generate then routes to /recommendations — the polling state machine on
 * that page picks up the active job on mount via the existing /active-job
 * endpoint, so we don't hold polling state here.
 */
export function PromptCard() {
  const api = useApi();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea up to a cap. Same approach as ChatInput.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [prompt]);

  async function submit() {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const body = prompt.trim() ? { prompt: prompt.trim() } : {};
      await api<{ jobId: string }>("/recommendations/generate", {
        method: "POST",
        body,
      });
      navigate("/recommendations");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start");
      setSubmitting(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void submit();
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <section className="rounded-xl border border-neutral-800 bg-gradient-to-br from-neutral-900 to-neutral-950 p-5 shadow-lg shadow-black/20">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex items-start gap-3">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKey}
            rows={3}
            disabled={submitting}
            placeholder="Describe what you're in the mood for — a feeling, a shape, a comp title…"
            style={{ maxHeight: "200px" }}
            className="flex-1 resize-none rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm leading-relaxed text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={submitting}
            className="self-end rounded-md bg-white px-5 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Starting…" : "Generate"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-neutral-500">
            Try
          </span>
          {STARTER_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setPrompt(p);
                textareaRef.current?.focus();
              }}
              disabled={submitting}
              className="rounded-full border border-neutral-700 bg-neutral-900/80 px-3 py-1.5 text-sm text-neutral-200 transition-colors hover:border-emerald-700 hover:bg-emerald-950/30 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {p}
            </button>
          ))}
        </div>

        {error && <p className="text-xs text-rose-400">{error}</p>}
      </form>
    </section>
  );
}
