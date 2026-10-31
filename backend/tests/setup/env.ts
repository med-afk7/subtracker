import { afterAll, beforeEach } from 'vitest';
import { fakeEmailSender, resetFakeEmail } from '../helpers/email.js';
import { loadTestEnv } from './testEnv.js';

// Runs before each test file, before any app module is imported
loadTestEnv();

// Capture emails instead of sending them
const { setEmailSender } = await import('../../src/email/sender.js');
setEmailSender(fakeEmailSender);
beforeEach(resetFakeEmail);

// Each test file gets fresh modules, and with them a fresh pool; close it when the file is done
afterAll(async () => {
  const { pool } = await import('../../src/db/index.js');
  await pool.end();
});
