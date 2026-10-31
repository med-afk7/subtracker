import { useAuth } from '../context/AuthContext';
import DashboardPage from '../pages/DashboardPage';
import LandingPage from '../pages/LandingPage';

// "/" is the dashboard for logged-in users and the landing page for everyone else
export default function HomeRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <p className="centered">Loading…</p>;
  return user ? <DashboardPage /> : <LandingPage />;
}
