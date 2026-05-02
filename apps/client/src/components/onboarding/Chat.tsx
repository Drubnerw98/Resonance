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

  const showStarter = onboarding.messages.length === 0 && !onboarding.isSending;

  // Cheap progress hint — onboarding readiness ~6+ user turns. We can
  // expose where the user is in that arc without surfacing the exact
  // criteria. After ready fires, hide the indicator.
  const userTurns = onboarding.messages.filter((m) => m.role === "user").length;
  const showProgress = !onboarding.ready && onboarding.messages.length > 0;
  const progressPct = Math.min(100, Math.round((userTurns / 6) * 100));

  return (
    <div className="flex h-[70vh] flex-col gap-4">
      {showProgress && (
        <div className="flex items-center gap-3 text-xs text-neutral-500">
          <span>Building your taste profile · turn {userTurns}</span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto rounded-md border border-neutral-800 bg-neutral-950 p-4"
      >
        {showStarter && (
          <div className="space-y-3 rounded-md border-l-2 border-emerald-500/50 bg-neutral-900/60 p-4 pl-5">
            <p className="text-sm text-neutral-200">
              <span className="font-medium text-emerald-300">
                Hey, glad you're here.
              </span>{" "}
              Don't list favorites. Talk about <em>moments</em>. A scene that
              stuck. A line you keep thinking about. A story that wrecked you.
              The more specific, the better the profile we build.
            </p>
            <p className="text-xs text-neutral-500">
              Type something below to start. Usually 6-9 turns to get a real
              profile.
            </p>
          </div>
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
