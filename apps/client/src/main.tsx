import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ClerkProvider } from "@clerk/clerk-react";
import { App } from "./App.tsx";
import "./styles/globals.css";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!publishableKey) {
  throw new Error(
    "VITE_CLERK_PUBLISHABLE_KEY is not set — see .env.local.example",
  );
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <ClerkProvider
        publishableKey={publishableKey}
        signInFallbackRedirectUrl="/me"
        signUpFallbackRedirectUrl="/me"
      >
        <App />
      </ClerkProvider>
    </BrowserRouter>
  </StrictMode>,
);
