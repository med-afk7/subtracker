import { describe, expect, it } from 'vitest';
import {
  canApply,
  stateOf,
  type LifecycleAction,
  type SubscriptionState,
} from '../../src/domain/lifecycle.js';

describe('stateOf', () => {
  it('derives the state from status and archived_at', () => {
    expect(stateOf({ status: 'active', archivedAt: null })).toBe('active');
    expect(stateOf({ status: 'cancelled', archivedAt: null })).toBe('cancelled');
    expect(stateOf({ status: 'cancelled', archivedAt: new Date() })).toBe('archived');
  });
});

describe('allowed transitions', () => {
  const allowed: [LifecycleAction, SubscriptionState][] = [
    ['cancel', 'active'],
    ['reactivate', 'cancelled'],
    ['archive', 'cancelled'],
    ['unarchive', 'archived'],
  ];
  const states: SubscriptionState[] = ['active', 'cancelled', 'archived'];

  // Every (action, state) pair: only the four above are allowed
  for (const action of ['cancel', 'reactivate', 'archive', 'unarchive'] as const) {
    for (const state of states) {
      const expected = allowed.some(([a, s]) => a === action && s === state);
      it(`${action} from ${state}: ${expected ? 'allowed' : 'rejected'}`, () => {
        expect(canApply(action, state)).toBe(expected);
      });
    }
  }
});
