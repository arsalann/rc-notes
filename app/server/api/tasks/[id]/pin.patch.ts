import { queryAll } from '~/server/utils/db';
import { withStoredTaskTags } from '~/server/utils/taskTagPresenter';
import { BOOLEAN, VARCHAR } from '@duckdb/node-api';

/**
 * `PATCH /api/tasks/:id/pin` — body `{ pinned?: boolean }`
 *
 * Explicit target when provided, legacy server-side toggle otherwise. Same reasoning as
 * `complete.patch.ts`: the optimistic client needs an idempotent write, or a retry flips twice.
 */
export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id'));

  const body = await readBody(event).catch(() => null);
  const target = body?.pinned;
  const explicit = typeof target === 'boolean';

  const params: Record<string, any> = { id };
  const types: Record<string, any> = { id: VARCHAR };
  let pinnedExpr = 'NOT pinned';
  if (explicit) {
    pinnedExpr = '$pinned';
    params.pinned = target;
    types.pinned = BOOLEAN;
  }

  const rows = await queryAll(
    `UPDATE tasks SET pinned = ${pinnedExpr}, updated_at = current_timestamp
     WHERE id = $id RETURNING *`,
    params,
    types
  );

  if (!rows.length) {
    throw createError({ statusCode: 404, statusMessage: 'Task not found' });
  }

  return await withStoredTaskTags(rows[0]);
});
