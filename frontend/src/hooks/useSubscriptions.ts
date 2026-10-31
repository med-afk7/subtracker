import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../api/client';
import * as api from '../api/subscriptions.api';
import type { Pagination, Subscription, SubscriptionQuery } from '../types';

// Loads one page of subscriptions for the given filters. Filtering, sorting and paging all
// happen on the server; `reload` re-fetches after a change.
export function useSubscriptions(query: SubscriptionQuery) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  const { search, category, state, interval, sort, page } = query;
  useEffect(() => {
    // `ignore` drops responses for filters the user has already moved on from
    let ignore = false;
    api
      .getSubscriptions({ search, category, state, interval, sort, page })
      .then((result) => {
        if (ignore) return;
        setSubscriptions(result.data);
        setPagination(result.pagination);
        setError('');
      })
      .catch((err) => !ignore && setError(errorMessage(err)))
      .finally(() => !ignore && setIsLoading(false));
    return () => {
      ignore = true;
    };
  }, [search, category, state, interval, sort, page, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  return { subscriptions, pagination, isLoading, error, reload };
}
