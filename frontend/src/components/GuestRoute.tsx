import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Keeps logged-in users away from the login and signup pages
export default function GuestRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <p className="centered">Loading…</p>;
  return user ? <Navigate to="/" replace /> : <Outlet />;
}
