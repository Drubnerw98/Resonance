import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

interface Props {
  onSend: (content: string) => void;
  disabled: boolean;
}

const MIN_ROWS = 4;
const MAX_HEIGHT_PX = 220;

export function ChatInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow as the user types, capped at MAX_HEIGHT_PX. Resets cleanly when
  // the message is sent and `value` returns to "".
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  // Refocus after a send finishes. Disabling a focused input drops focus in
  // the browser, so without this the user has to click back into the textarea
  // before each new turn. Tracking the previous `disabled` value (rather than
  // re-focusing on every render where !disabled) avoids stealing focus on
  // initial mount or when disabled never went true to begin with.
  const prevDisabledRef = useRef(disabled);
  useEffect(() => {
    if (prevDisabledRef.current && !disabled) {
      textareaRef.current?.focus();
    }
    prevDisabledRef.current = disabled;
  }, [disabled]);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        placeholder={
          disabled
            ? "Waiting for reply…"
            : "Tell me about it… (Shift+Enter for newline)"
        }
        rows={MIN_ROWS}
        disabled={disabled}
        style={{ maxHeight: `${MAX_HEIGHT_PX}px` }}
        className="flex-1 resize-none overflow-y-auto rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm leading-relaxed text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="self-end rounded-md bg-emerald-600 px-5 py-2 text-sm font-semibold text-neutral-950 shadow-sm transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500 disabled:shadow-none"
      >
        Send →
      </button>
    </form>
  );
}
