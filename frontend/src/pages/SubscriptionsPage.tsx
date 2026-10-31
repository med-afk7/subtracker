import { useCallback, useState } from 'react';
import { errorMessage } from '../api/client';
import * as api from '../api/subscriptions.api';
import ActionsMenu from '../components/ActionsMenu';
import { CancelForm, ReactivateForm } from '../components/LifecycleForms';
import Modal from '../components/Modal';
import Pagination from '../components/Pagination';
import SubscriptionForm from '../components/SubscriptionForm';
import SubscriptionList from '../components/SubscriptionList';
import SubscriptionToolbar from '../components/SubscriptionToolbar';
import { useSubscriptions } from '../hooks/useSubscriptions';
import type {
  Subscription,
  SubscriptionInput,
  SubscriptionPatch,
  SubscriptionQuery,
} from '../types';

// Which popup is open, and for which subscription
type Dialog =
  { kind: 'add' } | { kind: 'edit' | 'cancel' | 'reactivate'; subscription: Subscription } | null;

const INITIAL_QUERY: SubscriptionQuery = {
  search: '',
  category: '',
  state: '',
  interval: '',
  sort: 'nextBillingDate',
  page: 1,
};

export default function SubscriptionsPage() {
  const [query, setQuery] = useState(INITIAL_QUERY);
  const { subscriptions, pagination, isLoading, error, reload } = useSubscriptions(query);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [actionError, setActionError] = useState('');

  const changeFilters = useCallback(
    (changes: Partial<SubscriptionQuery>) => setQuery((q) => ({ ...q, ...changes, page: 1 })),
    [],
  );
  const close = () => setDialog(null);

  // Runs an action, then refreshes the list (ordering and dates come from the server)
  const run = async (action: () => Promise<unknown>) => {
    await action();
    close();
    reload();
  };
  // For one-click actions without a form: show any error above the list
  const runQuick = (action: () => Promise<unknown>) => {
    setActionError('');
    action()
      .then(reload)
      .catch((err) => setActionError(errorMessage(err)));
  };

  const handlers = {
    onEdit: (subscription: Subscription) => setDialog({ kind: 'edit', subscription }),
    onCancel: (subscription: Subscription) => setDialog({ kind: 'cancel', subscription }),
    onReactivate: (subscription: Subscription) => setDialog({ kind: 'reactivate', subscription }),
    onArchive: (s: Subscription) => runQuick(() => api.archiveSubscription(s.id)),
    onUnarchive: (s: Subscription) => runQuick(() => api.unarchiveSubscription(s.id)),
    onDelete: (s: Subscription) => {
      if (
        window.confirm(
          `Delete "${s.name}" and its price history? Archiving keeps the history instead.`,
        )
      ) {
        runQuick(() => api.deleteSubscription(s.id));
      }
    },
  };

  const hasFilters = query.search || query.category || query.state || query.interval;
  const emptyMessage = hasFilters
    ? 'No subscriptions match these filters.'
    : 'No subscriptions yet. Add your first one to see when it renews.';

  return (
    <main className="page">
      <div className="page-header">
        <h1>Subscriptions</h1>
        <div className="header-actions">
          <ActionsMenu
            label="Export"
            trigger="Export"
            actions={[
              { label: 'Subscriptions (CSV)', href: api.EXPORT_URLS.subscriptions },
              { label: 'Price history (CSV)', href: api.EXPORT_URLS.priceHistory },
            ]}
          />
          <button className="button" onClick={() => setDialog({ kind: 'add' })}>
            + Add subscription
          </button>
        </div>
      </div>

      <section className="card">
        <SubscriptionToolbar query={query} onChange={changeFilters} />
        {(error || actionError) && (
          <p className="error" role="alert">
            {error || actionError}
          </p>
        )}
        {isLoading ? (
          <p className="muted">Loading…</p>
        ) : (
          <SubscriptionList
            subscriptions={subscriptions}
            emptyMessage={emptyMessage}
            {...handlers}
          />
        )}
        {pagination && (
          <Pagination
            pagination={pagination}
            onPage={(page) => setQuery((q) => ({ ...q, page }))}
          />
        )}
      </section>

      <Modal
        isOpen={dialog !== null}
        title={
          dialog?.kind === 'add'
            ? 'Add subscription'
            : dialog?.kind === 'edit'
              ? 'Edit subscription'
              : dialog?.kind === 'cancel'
                ? 'Mark as cancelled'
                : 'Reactivate subscription'
        }
        onClose={close}
      >
        {dialog?.kind === 'add' && (
          <SubscriptionForm
            submitLabel="Add"
            onSubmit={(data) => run(() => api.createSubscription(data as SubscriptionInput))}
            onCancel={close}
          />
        )}
        {dialog?.kind === 'edit' && (
          <SubscriptionForm
            initial={dialog.subscription}
            submitLabel="Save"
            onSubmit={(data) =>
              run(() => api.updateSubscription(dialog.subscription.id, data as SubscriptionPatch))
            }
            onCancel={close}
          />
        )}
        {dialog?.kind === 'cancel' && (
          <CancelForm
            subscription={dialog.subscription}
            onConfirm={(endDate) =>
              run(() => api.cancelSubscription(dialog.subscription.id, endDate))
            }
            onClose={close}
          />
        )}
        {dialog?.kind === 'reactivate' && (
          <ReactivateForm
            subscription={dialog.subscription}
            onConfirm={(date) =>
              run(() => api.reactivateSubscription(dialog.subscription.id, date))
            }
            onClose={close}
          />
        )}
      </Modal>
    </main>
  );
}
