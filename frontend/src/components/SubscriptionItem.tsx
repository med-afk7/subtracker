import { Link } from 'react-router-dom';
import ServiceIcon from './ServiceIcon';
import type { Subscription } from '../types';
import {
  describeDaysUntil,
  describeFrequency,
  describeReminder,
  formatDate,
  formatMoney,
  perPeriod,
} from '../utils/format';
import ActionsMenu, { type MenuAction } from './ActionsMenu';

export interface SubscriptionHandlers {
  onEdit: (subscription: Subscription) => void;
  onCancel: (subscription: Subscription) => void;
  onReactivate: (subscription: Subscription) => void;
  onArchive: (subscription: Subscription) => void;
  onUnarchive: (subscription: Subscription) => void;
  onDelete: (subscription: Subscription) => void;
}

export default function SubscriptionItem({
  subscription: s,
  ...handlers
}: { subscription: Subscription } & SubscriptionHandlers) {
  // Which lifecycle actions make sense depends on the state (docs §4.1)
  const actions: MenuAction[] = [{ label: 'Edit', onSelect: () => handlers.onEdit(s) }];
  if (s.state === 'active')
    actions.push({ label: 'Mark as cancelled', onSelect: () => handlers.onCancel(s) });
  if (s.state === 'cancelled') {
    actions.push({ label: 'Reactivate', onSelect: () => handlers.onReactivate(s) });
    actions.push({ label: 'Archive', onSelect: () => handlers.onArchive(s) });
  }
  if (s.state === 'archived')
    actions.push({ label: 'Unarchive', onSelect: () => handlers.onUnarchive(s) });
  actions.push({ label: 'Delete', onSelect: () => handlers.onDelete(s), danger: true });

  return (
    <li className={`subscription-item ${s.state}`}>
      <ServiceIcon service={s.service} name={s.name} />

      <div className="item-main">
        <Link className="item-name" to={`/subscriptions/${s.id}`}>
          {s.name}
        </Link>
        <div className="muted">
          {formatMoney(s.amount, s.currency)} {perPeriod(s.billingInterval, s.billingIntervalCount)}
          <span className="dot">·</span>
          {s.category.name}
        </div>
        {s.state === 'active' && (
          <div className="reminder">{describeReminder(s.reminderMode, s.reminderDaysBefore)}</div>
        )}
      </div>

      <div className="renewal">
        {s.state === 'active' && s.nextBillingDate && (
          <>
            Next charge <span className="nowrap">{formatDate(s.nextBillingDate)}</span>
            <div>
              <span className="pill">{describeDaysUntil(s.nextBillingDate)}</span>
            </div>
          </>
        )}
        {s.state === 'active' && !s.nextBillingDate && <span className="muted">Ended</span>}
        {s.state !== 'active' && (
          <>
            <span className="badge">{s.state === 'archived' ? 'Archived' : 'Cancelled'}</span>
            {s.endDate && <div className="muted small">Access until {formatDate(s.endDate)}</div>}
          </>
        )}
      </div>

      <div className="item-actions">
        <button className="button secondary" onClick={() => handlers.onEdit(s)}>
          Edit
        </button>
        <ActionsMenu label={`More actions for ${s.name}`} actions={actions.slice(1)} />
      </div>
      <span className="visually-hidden">
        Billed {describeFrequency(s.billingInterval, s.billingIntervalCount)}
      </span>
    </li>
  );
}
