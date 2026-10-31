import type { CategoryBreakdown, DashboardSummary, SpendingTrends } from '../types';
import { request } from './client';

export const getSummary = () => request<DashboardSummary>('/dashboard/summary');
export const getCategoryBreakdown = () =>
  request<CategoryBreakdown[]>('/dashboard/category-breakdown');
export const getSpendingTrends = () =>
  request<SpendingTrends>('/dashboard/spending-trends?months=12');
