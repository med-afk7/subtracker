import type { CalendarData } from '../types';
import { request } from './client';

export function getCalendar(
  from: string,
  to: string,
  filters: { category: string; subscriptionId: string },
) {
  const params = new URLSearchParams({ from, to });
  if (filters.category) params.set('category', filters.category);
  if (filters.subscriptionId) params.set('subscriptionId', filters.subscriptionId);
  return request<CalendarData>(`/calendar?${params}`);
}
