import { Navigate, Route, Routes } from 'react-router-dom';
import GuestRoute from './components/GuestRoute';
import HomeRoute from './components/HomeRoute';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import AccountPage from './pages/AccountPage';
import CalendarPage from './pages/CalendarPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import LoginPage from './pages/LoginPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import SignupPage from './pages/SignupPage';
import SubscriptionDetailsPage from './pages/SubscriptionDetailsPage';
import SubscriptionsPage from './pages/SubscriptionsPage';
import VerifyEmailPage from './pages/VerifyEmailPage';

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        {/* Only for logged-out visitors */}
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        </Route>

        {/* Opened from emails, so they work whether or not someone is logged in */}
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        <Route path="/" element={<HomeRoute />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/subscriptions" element={<SubscriptionsPage />} />
          <Route path="/subscriptions/:id" element={<SubscriptionDetailsPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/account" element={<AccountPage />} />
        </Route>

        <Route path="/profile" element={<Navigate to="/account" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
