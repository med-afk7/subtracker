import type { User } from '../types';
import { request } from './client';

export const updateAccount = (changes: { timezone: string }) =>
  request<User>('/account', { method: 'PATCH', body: changes });
// Accounts with a password confirm with it; Google-only accounts type their email instead
export type DeleteConfirmation = { password: string } | { confirmEmail: string };
export const deleteAccount = (confirmation: DeleteConfirmation) =>
  request<void>('/account', { method: 'DELETE', body: confirmation });
