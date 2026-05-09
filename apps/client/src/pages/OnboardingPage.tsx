import { useSearchParams } from "react-router-dom";
import { Chat } from "../components/onboarding/Chat.tsx";
import { FastForm } from "../components/onboarding/FastForm.tsx";
import { PageHeader } from "../components/shared/PageHeader.tsx";

export function OnboardingPage() {
  const [params] = useSearchParams();
  const mode = params.get("mode") === "fast" ? "fast" : "chat";

  if (mode === "fast") {
    return (
      <section className="space-y-6">
        <PageHeader
          title="Quick start"
          subtitle="A guided form. Faster than the chat — we extract a starting profile from named titles + a few preference picks. You can always deepen it later by talking it out."
        />
        <FastForm />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Onboarding"
        subtitle="A short conversation about what you actually love about stories. Don't list favorites. Talk about moments, feelings, things you've kept thinking about."
      />
      <Chat />
    </section>
  );
}
