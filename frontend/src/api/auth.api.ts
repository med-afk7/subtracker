import type { Credentials, User } from '../types';
import { request } from './client';

interface Message {
  message: string;
}

export const register = (credentials: Credentials & { timezone?: string }) =>
  request<Message>('/auth/register', { method: 'POST', body: credentials });
export const verifyEmail = (token: string) =>
  request<User>('/auth/verify-email', { method: 'POST', body: { token } });
export const resendVerification = (email: string) =>
  request<Message>('/auth/resend-verification', { method: 'POST', body: { email } });
export const login = (credentials: Credentials) =>
  request<User>('/auth/login', { method: 'POST', body: credentials });
export const logout = () => request<void>('/auth/logout', { method: 'POST' });
export const forgotPassword = (email: string) =>
  request<Message>('/auth/forgot-password', { method: 'POST', body: { email } });
export const resetPassword = (token: string, newPassword: string) =>
  request<void>('/auth/reset-password', { method: 'POST', body: { token, newPassword } });
export const changePassword = (currentPassword: string, newPassword: string) =>
  request<void>('/auth/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
export const getCurrentUser = () => request<User>('/auth/me');
