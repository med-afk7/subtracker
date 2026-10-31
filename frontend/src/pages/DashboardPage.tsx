import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../api/client';
import * as dashboardApi from '../api/dashboard.api';
import CategoryBars from '../components/dashboard/CategoryBars';
import PriceChanges from '../components/dashboard/PriceChanges';
import SpendingOverview from '../components/dashboard/SpendingOverview';
import SpendingTrends from '../components/dashboard/SpendingTrends';
import UpcomingPayments from '../components/dashboard/UpcomingPayments';
import type { CategoryBreakdown, DashboardSummary, SpendingTrends as Trends } from '../types';

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [breakdown, setBreakdown] = useState<CategoryBreakdown[]>([]);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    Promise.all([
      dashboardApi.getSummary(),
      dashboardApi.getCategoryBreakdown(),
      dashboardApi.getSpendingTrends(),
    ])
      .then(([s, b, t]) => {
        if (ignore) return;
        setSummary(s);
        setBreakdown(b);
        setTrends(t);
      })
      .catch((err) => !ignore && setError(errorMessage(err)));
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <main className="page wide">
      <div className="page-header">
        <h1>Dashboard</h1>
        <Link className="button secondary" to="/subscriptions">
          Manage subscriptions
        </Link>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!summary && !error && <p className="muted">Loading…</p>}

      {summary && summary.activeCount === 0 && (
        <section className="card empty-dashboard">
          <h2>Nothing to show yet</h2>
          <p className="muted">
            Add the subscriptions you pay for to see what they cost and when they renew.
          </p>
          <Link className="button" to="/subscriptions">
            Add a subscription
          </Link>
        </section>
      )}

      {summary && summary.activeCount > 0 && (
        <>
          <SpendingOverview activeCount={summary.activeCount} totals={summary.totals} />
          <div className="dashboard-columns">
            <UpcomingPayments payments={summary.upcoming} windowDays={summary.upcomingWindowDays} />
            <CategoryBars breakdown={breakdown} />
          </div>
          {trends && <SpendingTrends trends={trends} />}
          <PriceChanges changes={summary.recentPriceChanges} />
        </>
      )}
    </main>
  );
}
