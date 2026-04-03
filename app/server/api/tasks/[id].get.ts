import { queryAll } from '~/server/utils/db';
import { VARCHAR } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id'));

  const rows = await queryAll('SELECT * FROM tasks WHERE id = $id', { id }, { id: VARCHAR });

  if (!rows.length) {
    throw createError({ statusCode: 404, statusMessage: 'Task not found' });
  }

  // Also fetch subtasks
  const subtasks = await queryAll(
    'SELECT * FROM tasks WHERE parent_id = $id ORDER BY completed ASC, position ASC',
    { id },
    { id: VARCHAR }
  );

  return { ...rows[0], subtasks };
});
