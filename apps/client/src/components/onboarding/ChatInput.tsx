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
        className="self-end rounded-md bg-white px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Send
      </button>
    </form>
  );
}
