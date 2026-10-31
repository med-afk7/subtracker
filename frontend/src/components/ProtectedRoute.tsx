import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Only renders child routes for logged-in users
export default function ProtectedRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <p className="centered">Loading…</p>;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}
