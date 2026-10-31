import argon2 from 'argon2';

// OWASP's recommended Argon2id settings: 19 MiB memory, 2 iterations, 1 thread.
// The memory cost is what makes large-scale GPU cracking expensive.
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const hashPassword = (password: string) => argon2.hash(password, ARGON2_OPTIONS);

export const verifyPassword = (hash: string, password: string) => argon2.verify(hash, password);

// Login with an unknown email still runs one verification against this hash, so the response
// time doesn't reveal whether the account exists
let dummyHash: Promise<string> | undefined;
export async function spendPasswordCheckTime(password: string): Promise<void> {
  dummyHash ??= hashPassword('dummy-password-for-timing');
  await argon2.verify(await dummyHash, password);
}
