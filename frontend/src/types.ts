// Shapes returned by the API (see backend/src/services)

export interface User {
  id: string;
  email: string;
  timezone: string;
  createdAt: string;
}

export interface Credentials {
  email: string;
  password: string;
}

export interface Category {
  slug: string;
  name: string;
}

export type BillingInterval = 'week' | 'month' | 'year';
export type SubscriptionState = 'active' | 'cancelled' | 'archived';
export type ReminderMode = 'default' | 'custom' | 'off';

export interface Subscription {
  id: string;
  name: string;
  category: Category;
  notes: string | null;
  amount: string; // decimal string in the currency's units, e.g. "15.99"
  currency: string;
  billingInterval: BillingInterval;
  billingIntervalCount: number;
  startDate: string;
  nextBillingDate: string | null;
  endDate: string | null;
  state: SubscriptionState;
  cancelledAt: string | null;
  archivedAt: string | null;
  reminderMode: ReminderMode;
  reminderDaysBefore: number | null;
  paymentMethodLabel: string | null;
  providerWebsite: string | null;
  cancellationUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// Body for POST /subscriptions; PATCH takes any subset plus priceEffectiveDate
export interface SubscriptionInput {
  name: string;
  category: string;
  amount: string;
  currency: string;
  billingInterval: BillingInterval;
  billingIntervalCount: number;
  startDate: string;
  nextBillingDate?: string;
  endDate: string | null;
  reminderMode: ReminderMode;
  reminderDaysBefore: number | null;
  paymentMethodLabel: string | null;
  providerWebsite: string | null;
  cancellationUrl: string | null;
  notes: string | null;
}

export type SubscriptionPatch = Partial<SubscriptionInput> & { priceEffectiveDate?: string };

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SubscriptionQuery {
  search: string;
  category: string;
  state: '' | SubscriptionState;
  interval: '' | BillingInterval;
  sort: 'nextBillingDate' | 'amount' | 'name';
  page: number;
}

export interface CurrencyTotal {
  currency: string;
  subscriptionCount: number;
  monthlyEquivalent: string;
  annualized: string;
}

export interface UpcomingPayment {
  subscriptionId: string;
  name: string;
  date: string;
  amount: string;
  currency: string;
  status: 'expected';
}

export interface PriceChange {
  subscriptionId: string;
  name: string;
  effectiveDate: string;
  previousAmount: string;
  newAmount: string;
  currency: string;
  difference: string | null;
}

export interface DashboardSummary {
  activeCount: number;
  totals: CurrencyTotal[];
  upcoming: UpcomingPayment[];
  upcomingWindowDays: number;
  recentPriceChanges: PriceChange[];
}

export interface CategoryBreakdown {
  currency: string;
  subscriptionCount: number;
  monthlyEquivalent: string;
  categories: {
    slug: string;
    name: string;
    subscriptionCount: number;
    monthlyEquivalent: string;
    share: number;
  }[];
}

export interface CalendarEvent {
  date: string;
  subscriptionId: string;
  name: string;
  category: Category;
  amount: string;
  currency: string;
  status: 'expected';
  isPast: boolean;
}

export interface CalendarData {
  from: string;
  to: string;
  events: CalendarEvent[];
  totals: { currency: string; amount: string; count: number }[];
}

export interface NotificationPreferences {
  remindersEnabled: boolean;
  defaultReminderDaysBefore: number;
}

export interface ReminderDelivery {
  id: string;
  subscriptionId: string;
  subscriptionName: string;
  amount: string;
  currency: string;
  billingDate: string;
  daysBefore: number;
  scheduledFor: string;
  status: 'pending' | 'sending' | 'retrying' | 'sent' | 'failed' | 'skipped';
  attemptCount: number;
  sentAt: string | null;
  lastErrorCode: string | null;
}

export interface PriceHistoryEntry {
  amount: string;
  currency: string;
  effectiveDate: string;
  recordedAt: string;
  source: 'initial' | 'manual_update';
  previousAmount: string | null;
  difference: string | null;
}

export interface PriceHistory {
  subscriptionId: string;
  name: string;
  entries: PriceHistoryEntry[];
  overall: {
    from: { amount: string; currency: string; effectiveDate: string };
    to: { amount: string; currency: string; effectiveDate: string };
    difference: string | null;
  } | null;
}

export type SubscriptionDetails = Subscription & { upcomingBillingDates: string[] };

export interface SpendingTrends {
  months: number;
  points: {
    month: string;
    date: string;
    totals: { currency: string; subscriptionCount: number; monthlyEquivalent: string }[];
  }[];
}
