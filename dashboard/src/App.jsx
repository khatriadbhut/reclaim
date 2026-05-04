import Landing from "./pages/Landing.jsx";
import CompanyDashboard from "./pages/CompanyDashboard.jsx";
import UserDashboard from "./pages/UserDashboard.jsx";

export default function App() {
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  if (path.startsWith("/company")) return <CompanyDashboard />;
  if (path.startsWith("/user")) return <UserDashboard />;
  return <Landing />;
}

