import { queryAll } from '~/server/utils/db';
import { withDerivedTaskTags } from '~/server/utils/taskTagPresenter';
import { VARCHAR } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id'));

  const rows = await queryAll(`
    SELECT t.*, p.title AS parent_title
    FROM tasks t
    LEFT JOIN tasks p ON p.id = t.parent_id
    WHERE t.id = $id
  `, { id }, { id: VARCHAR });

  if (!rows.length) {
    throw createError({ statusCode: 404, statusMessage: 'Task not found' });
  }

  // Also fetch subtasks
  const subtasks = await queryAll(
    `SELECT t.*, p.title AS parent_title
     FROM tasks t
     LEFT JOIN tasks p ON p.id = t.parent_id
     WHERE t.parent_id = $id
     ORDER BY t.completed ASC, t.position ASC`,
    { id },
    { id: VARCHAR }
  );

  return {
    ...withDerivedTaskTags(rows[0]),
    subtasks: subtasks.map(task => withDerivedTaskTags(task)),
  };
});
