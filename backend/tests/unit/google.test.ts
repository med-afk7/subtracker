import { describe, expect, it } from 'vitest';
import { profileFromIdToken } from '../../src/oauth/google.js';
import { fakeIdToken } from '../helpers/google.js';

const NOW = 1_800_000_000;
const expected = { clientId: 'client-1', nonce: 'nonce-1', nowSeconds: NOW };
const valid = {
  iss: 'https://accounts.google.com',
  aud: 'client-1',
  exp: NOW + 3600,
  nonce: 'nonce-1',
  sub: '1234567890',
  email: ' Ada@Example.com ',
  email_verified: true,
};

const reasonFor = (claims: Record<string, unknown>) => {
  try {
    profileFromIdToken(fakeIdToken(claims), expected);
    return 'accepted';
  } catch (err) {
    return (err as { reason?: string }).reason;
  }
};

describe('profileFromIdToken', () => {
  it('returns the subject and the normalized email', () => {
    expect(profileFromIdToken(fakeIdToken(valid), expected)).toEqual({
      subject: '1234567890',
      email: 'ada@example.com',
    });
  });

  it('accepts the issuer without a scheme and a slightly early clock', () => {
    expect(reasonFor({ ...valid, iss: 'accounts.google.com' })).toBe('accepted');
    expect(reasonFor({ ...valid, exp: NOW - 30 })).toBe('accepted');
  });

  it.each([
    ['wrong_issuer', { iss: 'https://evil.example' }],
    ['wrong_audience', { aud: 'another-app' }],
    ['expired', { exp: NOW - 3600 }],
    ['wrong_nonce', { nonce: 'replayed' }],
    ['missing_subject', { sub: '' }],
    ['missing_email', { email: undefined }],
    ['email_not_verified', { email_verified: false }],
  ])('refuses a token with %s', (reason, change) => {
    expect(reasonFor({ ...valid, ...change })).toBe(reason);
  });

  it('refuses garbage', () => {
    expect(() => profileFromIdToken('not-a-jwt', expected)).toThrow(/malformed_id_token/);
    expect(() => profileFromIdToken('a.!!!.c', expected)).toThrow(/malformed_id_token/);
  });
});
