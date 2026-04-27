import { queryAll } from '~/server/utils/db';
import { VARCHAR } from '@duckdb/node-api';

// Returns tasks whose completed_at falls within [from, to] (UTC dates, inclusive,
// expanded by one day on each side so callers can re-bucket by local date safely).
export default defineEventHandler(async (event) => {
  const { from, to, workspace_id } = getQuery(event);
  if (!from || !to) throw createError({ statusCode: 400, statusMessage: 'from and to are required' });

  const params: Record<string, any> = { from: String(from), to: String(to) };
  const types: Record<string, any> = { from: VARCHAR, to: VARCHAR };

  let wsFilter = '';
  if (workspace_id) {
    wsFilter = ' AND t.workspace_id = $ws';
    params.ws = String(workspace_id);
    types.ws = VARCHAR;
  }

  return await queryAll(`
    SELECT t.id, t.display_id, t.workspace_id, t.title, t.status, t.priority,
      t.completed, t.completed_at, t.due_at, t.tags, t.created_at, t.updated_at
    FROM tasks t
    WHERE t.parent_id IS NULL
      AND t.completed = true
      AND t.completed_at IS NOT NULL
      AND t.completed_at >= ($from::DATE - INTERVAL 1 DAY)
      AND t.completed_at < ($to::DATE + INTERVAL 2 DAY)
      ${wsFilter}
    ORDER BY t.completed_at DESC
  `, params, types);
});
