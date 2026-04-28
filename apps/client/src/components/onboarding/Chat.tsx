import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useOnboarding } from "../../hooks/useOnboarding.ts";
import { ChatMessage } from "./ChatMessage.tsx";
import { ChatInput } from "./ChatInput.tsx";
import { Skeleton } from "../shared/Skeleton.tsx";

export function Chat() {
  const onboarding = useOnboarding();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Stick to the bottom whenever new content arrives (messages or streaming).
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [onboarding.messages, onboarding.streamingText]);

  async function handleExtract() {
    try {
      await onboarding.complete();
      navigate("/profile");
    } catch {
      // Error is set in the hook; stay on the page so the user can retry.
    }
  }

  if (onboarding.sessionStatus === "loading") {
    return (
      <div className="flex h-[70vh] flex-col gap-4">
        <div className="flex-1 space-y-3 rounded-md border border-neutral-800 bg-neutral-950 p-4">
          <div className="flex justify-start">
            <Skeleton className="h-12 w-3/4 rounded-2xl" />
          </div>
          <div className="flex justify-end">
            <Skeleton className="h-12 w-1/2 rounded-2xl" />
          </div>
          <div className="flex justify-start">
            <Skeleton className="h-12 w-2/3 rounded-2xl" />
          </div>
        </div>
        <Skeleton className="h-16 rounded-md" />
      </div>
    );
  }

  if (onboarding.sessionStatus === "error") {
    return (
      <pre className="rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
        {onboarding.error ?? "Unknown error"}
      </pre>
    );
  }

  if (onboarding.sessionStatus === "completed") {
    return (
      <div className="flex h-[70vh] flex-col gap-4">
        <div
          ref={scrollRef}
          className="flex-1 space-y-3 overflow-y-auto rounded-md border border-neutral-800 bg-neutral-950 p-4"
        >
          {onboarding.messages.map((m, i) => (
            <ChatMessage key={i} message={m} />
          ))}
        </div>

        {onboarding.error && (
          <pre className="rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
            {onboarding.error}
          </pre>
        )}

        <div className="flex items-center justify-between rounded-md border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
          <span>
            {onboarding.isExtracting
              ? "Extracting your taste profile…"
              : "Onboarding complete."}
          </span>
          <button
            onClick={() => void handleExtract()}
            disabled={onboarding.isExtracting}
            className="rounded-md bg-emerald-700 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {onboarding.isExtracting ? "Working…" : "View your profile"}
          </button>
        </div>
      </div>
    );
  }

  const showStarter =
    onboarding.messages.length === 0 && !onboarding.isSending;

  return (
    <div className="flex h-[70vh] flex-col gap-4">
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto rounded-md border border-neutral-800 bg-neutral-950 p-4"
      >
        {showStarter && (
          <p className="text-sm text-neutral-500">
            Say hi to kick things off — or jump straight into a story that's
            been on your mind.
          </p>
        )}

        {onboarding.messages.map((m, i) => (
          <ChatMessage key={i} message={m} />
        ))}

        {onboarding.isSending && (
          <ChatMessage
            message={{
              role: "assistant",
              content: onboarding.streamingText || "…",
            }}
            pending
          />
        )}
      </div>

      {onboarding.error && (
        <pre className="rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
          {onboarding.error}
        </pre>
      )}

      {onboarding.ready && (
        <div className="flex items-center justify-between rounded-md border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
          <span>
            {onboarding.isExtracting
              ? "Extracting your taste profile…"
              : "I've got enough to extract a profile."}
          </span>
          <button
            onClick={() => void handleExtract()}
            disabled={onboarding.isExtracting}
            className="rounded-md bg-emerald-700 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {onboarding.isExtracting ? "Working…" : "Finish onboarding"}
          </button>
        </div>
      )}

      <ChatInput
        onSend={(c) => void onboarding.send(c)}
        disabled={onboarding.isSending || onboarding.isExtracting}
      />
    </div>
  );
}
