import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as accountApi from '../api/account.api';
import * as authApi from '../api/auth.api';
import type { Credentials, User } from '../types';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  register: (credentials: Credentials) => Promise<void>;
  verifyEmail: (token: string) => Promise<void>;
  login: (credentials: Credentials) => Promise<void>;
  logout: () => Promise<void>;
  updateTimezone: (timezone: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  notice: string | null;
  clearNotice: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// The browser's timezone, sent at sign-up so reminders use the user's local "today"
const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // One-off message for the next page, e.g. after deleting the account
  const [notice, setNotice] = useState<string | null>(null);

  // Restore the session from the cookie on first load
  useEffect(() => {
    authApi
      .getCurrentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  const value: AuthContextValue = {
    user,
    isLoading,
    // Doesn't log in: the account has to be verified through the emailed link first
    register: async (credentials) => {
      await authApi.register({ ...credentials, timezone: browserTimezone() });
    },
    verifyEmail: async (token) => setUser(await authApi.verifyEmail(token)),
    login: async (credentials) => setUser(await authApi.login(credentials)),
    logout: async () => {
      await authApi.logout();
      setUser(null);
    },
    updateTimezone: async (timezone) => setUser(await accountApi.updateAccount({ timezone })),
    changePassword: (currentPassword, newPassword) =>
      authApi.changePassword(currentPassword, newPassword),
    deleteAccount: async (password) => {
      await accountApi.deleteAccount(password);
      // Clearing the user sends the protected page to /login, which shows this notice
      setNotice('Your account and its data were deleted.');
      setUser(null);
    },
    notice,
    clearNotice: () => setNotice(null),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

// For components rendered behind <ProtectedRoute>, where a user is guaranteed
export function useCurrentUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useCurrentUser used outside a protected route');
  return user;
}
