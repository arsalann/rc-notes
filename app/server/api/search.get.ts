import { queryAll } from '~/server/utils/db';
import { VARCHAR } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const { q, workspace_id } = getQuery(event);

  if (!q || typeof q !== 'string' || q.trim().length === 0) return [];

  const term = `%${q.trim()}%`;
  const params: Record<string, any> = { term };
  const types: Record<string, any> = { term: VARCHAR };

  let wsFilter = '';
  if (workspace_id) {
    wsFilter = ' AND workspace_id = $ws';
    params.ws = workspace_id;
    types.ws = VARCHAR;
  }

  return await queryAll(`
    SELECT * FROM (
      SELECT id, display_id, 'task' as type, title, description as detail, completed, pinned, due_at, tags, updated_at
      FROM tasks
      WHERE archived = false AND parent_id IS NULL ${wsFilter}
        AND (title ILIKE $term OR description ILIKE $term OR display_id ILIKE $term)
      UNION ALL
      SELECT id, display_id, 'note' as type, title,
        CASE WHEN length(content) > 100 THEN substring(content, 1, 100) || '...' ELSE content END as detail,
        false as completed, pinned, NULL as due_at, tags, updated_at
      FROM notes
      WHERE archived = false ${wsFilter}
        AND (title ILIKE $term OR content ILIKE $term OR display_id ILIKE $term)
    ) combined
    ORDER BY updated_at DESC LIMIT 30
  `, params, types);
});
