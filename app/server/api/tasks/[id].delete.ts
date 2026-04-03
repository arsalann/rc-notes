import { queryAll, execute } from '~/server/utils/db';
import { VARCHAR } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id'));

  // Delete subtasks first
  await execute('DELETE FROM tasks WHERE parent_id = $id', { id }, { id: VARCHAR });

  const rows = await queryAll('DELETE FROM tasks WHERE id = $id RETURNING id', { id }, { id: VARCHAR });

  if (!rows.length) {
    throw createError({ statusCode: 404, statusMessage: 'Task not found' });
  }

  return { deleted: true };
});
