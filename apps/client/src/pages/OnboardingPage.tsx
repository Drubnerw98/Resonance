import { Chat } from "../components/onboarding/Chat.tsx";

export function OnboardingPage() {
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Onboarding</h1>
        <p className="text-sm text-neutral-400">
          A short conversation about what you actually love about stories.
          Don&apos;t list favorites — talk about moments, feelings, things
          you&apos;ve kept thinking about.
        </p>
      </div>
      <Chat />
    </section>
  );
}
