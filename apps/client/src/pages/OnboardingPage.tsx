import { Chat } from "../components/onboarding/Chat.tsx";
import { PageHeader } from "../components/shared/PageHeader.tsx";

export function OnboardingPage() {
  return (
    <section className="space-y-6">
      <PageHeader
        title="Onboarding"
        subtitle="A short conversation about what you actually love about stories. Don't list favorites — talk about moments, feelings, things you've kept thinking about."
      />
      <Chat />
    </section>
  );
}
