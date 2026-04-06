import { queryAll } from '~/server/utils/db';
import { VARCHAR } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id'));

  const rows = await queryAll(
    `UPDATE tasks SET
      completed = NOT completed,
      completed_at = CASE WHEN completed THEN NULL ELSE current_timestamp END,
      status = CASE WHEN completed THEN 'next' ELSE 'done' END,
      updated_at = current_timestamp
     WHERE id = $id RETURNING *`,
    { id },
    { id: VARCHAR }
  );

  if (!rows.length) {
    throw createError({ statusCode: 404, statusMessage: 'Task not found' });
  }

  return rows[0];
});
