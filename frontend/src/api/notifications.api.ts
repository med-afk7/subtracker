import type { NotificationPreferences, Pagination, ReminderDelivery } from '../types';
import { request, requestPage } from './client';

export const getPreferences = () => request<NotificationPreferences>('/notification-preferences');
export const updatePreferences = (changes: Partial<NotificationPreferences>) =>
  request<NotificationPreferences>('/notification-preferences', { method: 'PATCH', body: changes });
export const getDeliveries = () =>
  requestPage<ReminderDelivery, Pagination>('/notifications?limit=10');
