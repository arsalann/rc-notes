import { useDB } from '~/server/utils/db';
import { flushEvents } from '~/server/utils/eventLog';

/**
 * Boot and shutdown work that used to be paid inside the first user request.
 *
 * - Pre-warm the DuckDB/MotherDuck connection so the ATTACH + schema check happens at boot instead
 *   of inside whichever request arrives first. Safe to fire-and-forget: `useDB()` memoizes, and it
 *   now clears the memo on rejection, so a transient failure here does not brick the process the way
 *   a cached rejected promise used to. See .context/perf-plan.md item 6.
 * - Flush buffered read events on the way out, so the tail of the audit log is not lost on a clean
 *   shutdown. See item 7.
 */
export default defineNitroPlugin((nitroApp) => {
  const started = Date.now();
  useDB()
    .then(() => console.log(`[db] connection ready in ${Date.now() - started}ms`))
    .catch((e) => console.warn('[db] pre-warm failed, will retry on first request:', e?.message));

  nitroApp.hooks.hook('close', async () => {
    await flushEvents();
  });

  let closing = false;
  const drain = async () => {
    if (closing) return;
    closing = true;
    await flushEvents();
  };
  process.once('SIGTERM', drain);
  process.once('SIGINT', drain);
  process.once('beforeExit', drain);
});
