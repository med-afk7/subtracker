import { getEmailSender, type EmailSender } from '../email/sender.js';
import { logger } from '../lib/logger.js';
import { runDispatcher } from './dispatcher.js';
import { runMaintenance } from './maintenance.js';
import { runScheduler } from './scheduler.js';

// One run of all background work. Called by the worker loop (local/always-on hosting) or by
// the scheduled POST /api/internal/tick (GitHub Actions cron). Every step is safe to repeat and
// to run concurrently with another tick.
export async function runTick(options: { now?: Date; sender?: EmailSender } = {}) {
  const now = options.now ?? new Date();
  const sender = options.sender ?? getEmailSender();
  const log = logger.child({ job: 'tick' });
  const started = Date.now();

  // Steps run in order but fail independently: a maintenance error doesn't block reminders
  const step = async <T>(name: string, fn: () => Promise<T>): Promise<T | { error: string }> => {
    try {
      return await fn();
    } catch (err) {
      log.error({ err, step: name }, 'Background step failed');
      return { error: (err as Error).message };
    }
  };

  const result = {
    maintenance: await step('maintenance', () => runMaintenance(now)),
    scheduler: await step('scheduler', () => runScheduler(now)),
    dispatcher: await step('dispatcher', () => runDispatcher(now, sender, log)),
  };
  // One summary line per tick: the heartbeat that shows the worker is alive
  log.info({ ...result, durationMs: Date.now() - started }, 'Tick finished');
  return result;
}
