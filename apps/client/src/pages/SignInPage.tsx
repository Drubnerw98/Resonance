import { SignIn } from "@clerk/clerk-react";

export function SignInPage() {
  return (
    <section className="flex justify-center pt-6">
      <SignIn
        path="/sign-in"
        routing="path"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/"
      />
    </section>
  );
}
