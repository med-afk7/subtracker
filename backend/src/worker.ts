import { env } from './config/env.js';
import { pool } from './db/index.js';
import { runTick } from './jobs/tick.js';
import { logger } from './lib/logger.js';

// Long-running worker: one tick, wait, repeat. For local development or an always-on host;
// in the free deployment a scheduled job calls POST /api/internal/tick instead (docs §6).
let stopping = false;
let wake: (() => void) | undefined;

async function loop() {
  logger.info({ intervalMs: env.workerIntervalMs }, 'Worker started');
  while (!stopping) {
    try {
      await runTick();
    } catch (err) {
      // e.g. the database is briefly unreachable: log it and try again next round
      logger.error({ err }, 'Tick crashed');
    }
    await new Promise<void>((resolve) => {
      wake = resolve;
      setTimeout(resolve, env.workerIntervalMs);
    });
  }
  await pool.end();
  logger.info('Worker stopped');
}

// Finish the current tick, then exit (hosting platforms send SIGTERM before replacing a worker)
function stop(signal: string) {
  logger.info({ signal }, 'Stopping worker after the current tick');
  stopping = true;
  wake?.();
}
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));

void loop();
