import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// 32 random bytes = 256 bits: impossible to guess. base64url is safe in cookies and URLs.
export const generateToken = () => randomBytes(32).toString('base64url');

// Tokens are stored as SHA-256 hashes. A fast hash is fine here (unlike passwords) because
// the input is already 256 bits of randomness, so there is nothing to brute-force.
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

// PKCE (RFC 7636): the authorization request carries this hash; the code exchange later proves
// knowledge of the original verifier, so a stolen authorization code is useless on its own
export const pkceChallenge = (verifier: string) =>
  createHash('sha256').update(verifier).digest('base64url');

// Compares secrets without leaking how many leading characters matched through timing
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
