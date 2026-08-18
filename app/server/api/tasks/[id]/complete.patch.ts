import { queryAll } from '~/server/utils/db';
import { withStoredTaskTags } from '~/server/utils/taskTagPresenter';
import { BOOLEAN, VARCHAR } from '@duckdb/node-api';

/**
 * `PATCH /api/tasks/:id/complete` — body `{ completed?: boolean }`
 *
 * Pass `completed` to set an explicit target. Omit it for the legacy server-side toggle.
 *
 * The explicit form exists because the client now updates optimistically: with a pure
 * `completed = NOT completed`, a double-tap or a retried request flips twice and the UI ends up
 * showing the exact opposite of what is stored. An idempotent write cannot desync that way.
 * See .context/perf-plan.md item 3.
 */
export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id'));

  // GET/PATCH with no body is normal here, so a parse failure is not an error.
  const body = await readBody(event).catch(() => null);
  const target = body?.completed;
  const explicit = typeof target === 'boolean';

  const params: Record<string, any> = { id };
  const types: Record<string, any> = { id: VARCHAR };
  let completedExpr = 'NOT completed';
  if (explicit) {
    completedExpr = '$completed';
    params.completed = target;
    types.completed = BOOLEAN;
  }

  const rows = await queryAll(
    `UPDATE tasks SET
      completed = ${completedExpr},
      completed_at = CASE WHEN ${completedExpr} THEN COALESCE(completed_at, current_timestamp) ELSE NULL END,
      status = CASE WHEN ${completedExpr} THEN 'done' ELSE 'next' END,
      updated_at = current_timestamp
     WHERE id = $id RETURNING *`,
    params,
    types
  );

  if (!rows.length) {
    throw createError({ statusCode: 404, statusMessage: 'Task not found' });
  }

  return await withStoredTaskTags(rows[0]);
});
