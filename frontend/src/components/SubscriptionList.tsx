import type { Subscription } from '../types';
import SubscriptionItem, { type SubscriptionHandlers } from './SubscriptionItem';

interface SubscriptionListProps extends SubscriptionHandlers {
  subscriptions: Subscription[];
  emptyMessage: string;
}

export default function SubscriptionList({
  subscriptions,
  emptyMessage,
  ...handlers
}: SubscriptionListProps) {
  if (subscriptions.length === 0) {
    return <p className="muted empty-state">{emptyMessage}</p>;
  }

  return (
    <ul className="subscription-list">
      {subscriptions.map((subscription) => (
        <SubscriptionItem key={subscription.id} subscription={subscription} {...handlers} />
      ))}
    </ul>
  );
}
