import { describe, expect, it } from 'vitest';
import { generateToken, hashToken } from '../../src/lib/crypto.js';

describe('tokens', () => {
  it('generates 256-bit URL-safe tokens that never repeat', () => {
    const tokens = new Set(Array.from({ length: 1000 }, generateToken));
    expect(tokens.size).toBe(1000);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('hashes deterministically to SHA-256 hex', () => {
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
