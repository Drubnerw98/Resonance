import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/shared/Layout.tsx";
import { RequireAuth } from "./components/shared/RequireAuth.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { OnboardingPage } from "./pages/OnboardingPage.tsx";
import { RecommendationsPage } from "./pages/RecommendationsPage.tsx";
import { EvaluatePage } from "./pages/EvaluatePage.tsx";
import { ExplorePage } from "./pages/ExplorePage.tsx";
import { ListsPage } from "./pages/ListsPage.tsx";
import { ProfilePage } from "./pages/ProfilePage.tsx";
import { MePage } from "./pages/MePage.tsx";
import { SignInPage } from "./pages/SignInPage.tsx";
import { SignUpPage } from "./pages/SignUpPage.tsx";

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
          <Route path="explore" element={<ExplorePage />} />
          <Route path="lists" element={<ListsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="me" element={<MePage />} />
        </Route>
      </Route>
    </Routes>
  );
}
