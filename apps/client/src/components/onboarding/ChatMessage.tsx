import type { OnboardingMessage } from "@resonance/shared";

interface Props {
  message: OnboardingMessage;
  pending?: boolean;
}

export function ChatMessage({ message, pending }: Props) {
  const isUser = message.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          isUser
            ? "max-w-[75%] rounded-2xl rounded-br-md bg-white px-4 py-2 text-sm text-neutral-950"
            : "max-w-[75%] rounded-2xl rounded-bl-md bg-neutral-800 px-4 py-2 text-sm text-neutral-100"
        }
      >
        <p className="whitespace-pre-wrap">
          {message.content}
          {pending && <span className="ml-0.5 animate-pulse">▍</span>}
        </p>
      </div>
    </div>
  );
}
