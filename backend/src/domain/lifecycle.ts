// Subscription lifecycle (docs §4.1):
//   active    - charges are expected
//   cancelled - the user recorded that they cancelled (we never contact the provider)
//   archived  - a cancelled subscription hidden from default lists; history is kept
// Stored as status + archived_at, so unarchiving returns exactly to "cancelled".

export type SubscriptionState = 'active' | 'cancelled' | 'archived';
export type LifecycleAction = 'cancel' | 'reactivate' | 'archive' | 'unarchive';

export function stateOf(sub: {
  status: 'active' | 'cancelled';
  archivedAt: Date | null;
}): SubscriptionState {
  if (sub.archivedAt) return 'archived';
  return sub.status;
}

const ALLOWED_FROM: Record<LifecycleAction, SubscriptionState> = {
  cancel: 'active',
  reactivate: 'cancelled',
  archive: 'cancelled',
  unarchive: 'archived',
};

export const canApply = (action: LifecycleAction, state: SubscriptionState) =>
  ALLOWED_FROM[action] === state;

// Why an action isn't allowed, phrased for the user
export function transitionError(action: LifecycleAction, state: SubscriptionState): string {
  if (action === 'archive' && state === 'active')
    return 'Cancel the subscription before archiving it';
  if (action === 'reactivate' && state === 'archived') return 'Unarchive the subscription first';
  return `Can't ${action} a subscription that is ${state}`;
}
