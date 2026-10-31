import { createHash, randomBytes } from 'node:crypto';

// 32 random bytes = 256 bits: impossible to guess. base64url is safe in cookies and URLs.
export const generateToken = () => randomBytes(32).toString('base64url');

// Tokens are stored as SHA-256 hashes. A fast hash is fine here (unlike passwords) because
// the input is already 256 bits of randomness, so there is nothing to brute-force.
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
