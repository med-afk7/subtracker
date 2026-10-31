import type {
  Category,
  PriceHistory,
  SubscriptionDetails,
  Pagination,
  Subscription,
  SubscriptionInput,
  SubscriptionPatch,
  SubscriptionQuery,
} from '../types';
import { request, requestPage } from './client';

export const PAGE_SIZE = 20;

export function getSubscriptions(query: SubscriptionQuery) {
  const params = new URLSearchParams({
    sort: query.sort,
    page: String(query.page),
    limit: String(PAGE_SIZE),
  });
  if (query.search) params.set('search', query.search);
  if (query.category) params.set('category', query.category);
  if (query.state) params.set('state', query.state);
  if (query.interval) params.set('interval', query.interval);
  return requestPage<Subscription, Pagination>(`/subscriptions?${params}`);
}

export const getCategories = () => request<Category[]>('/categories');

export const createSubscription = (data: SubscriptionInput) =>
  request<Subscription>('/subscriptions', { method: 'POST', body: data });
export const updateSubscription = (id: string, data: SubscriptionPatch) =>
  request<Subscription>(`/subscriptions/${id}`, { method: 'PATCH', body: data });
export const deleteSubscription = (id: string) =>
  request<void>(`/subscriptions/${id}`, { method: 'DELETE' });

export const cancelSubscription = (id: string, endDate: string | null) =>
  request<Subscription>(`/subscriptions/${id}/cancel`, { method: 'POST', body: { endDate } });
export const reactivateSubscription = (id: string, nextBillingDate: string) =>
  request<Subscription>(`/subscriptions/${id}/reactivate`, {
    method: 'POST',
    body: { nextBillingDate },
  });
export const archiveSubscription = (id: string) =>
  request<Subscription>(`/subscriptions/${id}/archive`, { method: 'POST' });
export const unarchiveSubscription = (id: string) =>
  request<Subscription>(`/subscriptions/${id}/unarchive`, { method: 'POST' });

export const getSubscription = (id: string) => request<SubscriptionDetails>(`/subscriptions/${id}`);
export const getPriceHistory = (id: string) =>
  request<PriceHistory>(`/subscriptions/${id}/history`);

// Plain links: the browser downloads the file with the session cookie (same origin)
export const EXPORT_URLS = {
  subscriptions: '/api/subscriptions/export?type=subscriptions',
  priceHistory: '/api/subscriptions/export?type=price-history',
};
