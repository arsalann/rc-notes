import { queryAll } from '~/server/utils/db';
import { VARCHAR } from '@duckdb/node-api';

// Returns incomplete parent tasks that are currently in 'now' status OR overdue.
export default defineEventHandler(async (event) => {
  const { workspace_id } = getQuery(event);

  const params: Record<string, any> = {};
  const types: Record<string, any> = {};

  let wsFilter = '';
  if (workspace_id) {
    wsFilter = ' AND t.workspace_id = $ws';
    params.ws = String(workspace_id);
    types.ws = VARCHAR;
  }

  return await queryAll(`
    SELECT t.id, t.display_id, t.workspace_id, t.title, t.status, t.priority,
      t.completed, t.completed_at, t.due_at, t.tags, t.created_at, t.updated_at,
      (t.due_at IS NOT NULL AND t.due_at < current_timestamp) AS is_overdue
    FROM tasks t
    WHERE t.parent_id IS NULL
      AND t.archived = false
      AND t.completed = false
      AND (
        t.status = 'now'
        OR (t.due_at IS NOT NULL AND t.due_at < current_timestamp)
      )
      ${wsFilter}
    ORDER BY
      (t.due_at IS NOT NULL AND t.due_at < current_timestamp) DESC,
      t.due_at ASC NULLS LAST,
      t.priority DESC,
      t.created_at DESC
  `, params, types);
});
