import { SignUp } from "@clerk/clerk-react";

export function SignUpPage() {
  return (
    <section className="flex justify-center pt-6">
      <SignUp
        path="/sign-up"
        routing="path"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/me"
      />
    </section>
  );
}
