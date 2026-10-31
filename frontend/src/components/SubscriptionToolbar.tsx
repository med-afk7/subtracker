import { useEffect, useState } from 'react';
import { useCategories } from '../hooks/useCategories';
import type { SubscriptionQuery } from '../types';

interface ToolbarProps {
  query: SubscriptionQuery;
  // Any filter change goes back to page 1
  onChange: (changes: Partial<SubscriptionQuery>) => void;
}

export default function SubscriptionToolbar({ query, onChange }: ToolbarProps) {
  const categories = useCategories();
  const [search, setSearch] = useState(query.search);

  // Wait until typing pauses before searching, instead of one request per keystroke
  useEffect(() => {
    if (search === query.search) return;
    const timer = setTimeout(() => onChange({ search: search.trim() }), 300);
    return () => clearTimeout(timer);
  }, [search, query.search, onChange]);

  return (
    <div className="toolbar" role="search">
      <label className="toolbar-search">
        <span className="visually-hidden">Search by name</span>
        <input
          type="search"
          placeholder="Search by name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <label>
        <span className="visually-hidden">Category</span>
        <select value={query.category} onChange={(e) => onChange({ category: e.target.value })}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="visually-hidden">Status</span>
        <select
          value={query.state}
          onChange={(e) => onChange({ state: e.target.value as SubscriptionQuery['state'] })}
        >
          <option value="">Not archived</option>
          <option value="active">Active</option>
          <option value="cancelled">Cancelled</option>
          <option value="archived">Archived</option>
        </select>
      </label>
      <label>
        <span className="visually-hidden">Billing frequency</span>
        <select
          value={query.interval}
          onChange={(e) => onChange({ interval: e.target.value as SubscriptionQuery['interval'] })}
        >
          <option value="">Any frequency</option>
          <option value="week">Weekly plans</option>
          <option value="month">Monthly and quarterly</option>
          <option value="year">Yearly plans</option>
        </select>
      </label>
      <label>
        <span className="visually-hidden">Sort by</span>
        <select
          value={query.sort}
          onChange={(e) => onChange({ sort: e.target.value as SubscriptionQuery['sort'] })}
        >
          <option value="nextBillingDate">Next charge</option>
          <option value="name">Name</option>
          <option value="amount">Price</option>
        </select>
      </label>
    </div>
  );
}
