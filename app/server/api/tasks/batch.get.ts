import { hydrateTasksByIds } from '~/server/utils/taskHydration';

/**
 * `GET /api/tasks/batch?ids=a,b,c` — the same payload shape as `GET /api/tasks/[id]`, for many IDs
 * in two queries instead of 2N.
 *
 * Exists as the fallback for the diary page's residual hydration path: tasks mentioned in `@[...]`
 * text without a link row, or created after the page loaded. That set is normally empty, but when it
 * isn't, it should still cost one request rather than N.
 *
 * Deliberately a separate route rather than an `ids=` mode on `GET /api/tasks`: that endpoint
 * returns a leaner projection with no `subtasks`, and one endpoint returning two different shapes
 * depending on a query param is how the client and server drift apart.
 */
const MAX_IDS = 500;

export default defineEventHandler(async (event) => {
  const { ids } = getQuery(event);

  const requested = String(ids || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (!requested.length) return [];
  if (requested.length > MAX_IDS) {
    throw createError({ statusCode: 400, statusMessage: `Too many ids (max ${MAX_IDS})` });
  }

  return await hydrateTasksByIds(requested);
});
