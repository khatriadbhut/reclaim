import Landing from "./pages/Landing.jsx";
import CompanyDashboard from "./pages/CompanyDashboard.jsx";
import UserDashboard from "./pages/UserDashboard.jsx";
import TermsPage from "./pages/TermsPage.jsx";
import PrivacyPage from "./pages/PrivacyPage.jsx";

export default function App() {
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  if (path.startsWith("/company")) return <CompanyDashboard />;
  if (path.startsWith("/user")) return <UserDashboard />;
  if (path.startsWith("/terms")) return <TermsPage />;
  if (path.startsWith("/privacy")) return <PrivacyPage />;
  return <Landing />;
}

