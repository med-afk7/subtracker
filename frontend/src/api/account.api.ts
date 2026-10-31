import type { User } from '../types';
import { request } from './client';

export const updateAccount = (changes: { timezone: string }) =>
  request<User>('/account', { method: 'PATCH', body: changes });
export const deleteAccount = (password: string) =>
  request<void>('/account', { method: 'DELETE', body: { password } });
