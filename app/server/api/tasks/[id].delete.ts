import { queryAll, execute } from '~/server/utils/db';
import { VARCHAR } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id'));

  // Archive subtasks
  await execute(
    'UPDATE tasks SET archived = true, updated_at = current_timestamp WHERE parent_id = $id',
    { id }, { id: VARCHAR }
  );

  // Archive the task itself
  const rows = await queryAll(
    'UPDATE tasks SET archived = true, updated_at = current_timestamp WHERE id = $id RETURNING *',
    { id }, { id: VARCHAR }
  );

  if (!rows.length) {
    throw createError({ statusCode: 404, statusMessage: 'Task not found' });
  }

  return rows[0];
});
