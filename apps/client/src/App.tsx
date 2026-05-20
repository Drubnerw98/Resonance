import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/shared/Layout.tsx";
import { RequireAuth } from "./components/shared/RequireAuth.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { OnboardingPage } from "./pages/OnboardingPage.tsx";
import { RecommendationsPage } from "./pages/RecommendationsPage.tsx";
import { EvaluatePage } from "./pages/EvaluatePage.tsx";
import { BatchesPage } from "./pages/BatchesPage.tsx";
import { WatchlistPage } from "./pages/WatchlistPage.tsx";
import { ProfilePage } from "./pages/ProfilePage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";
import { MePage } from "./pages/MePage.tsx";
import { SignInPage } from "./pages/SignInPage.tsx";
import { SignUpPage } from "./pages/SignUpPage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="sign-in/*" element={<SignInPage />} />
        <Route path="sign-up/*" element={<SignUpPage />} />

        <Route element={<RequireAuth />}>
          <Route path="onboarding" element={<OnboardingPage />} />
          <Route path="recommendations" element={<RecommendationsPage />} />
          <Route path="evaluate" element={<EvaluatePage />} />
          <Route path="batches" element={<BatchesPage />} />
          <Route path="watchlist" element={<WatchlistPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="me" element={<MePage />} />
        </Route>

        {/* Catch-all 404. Lives inside Layout so the nav + footer wrap a
            branded NotFoundPage, instead of falling through to Vercel's
            bare default. */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
