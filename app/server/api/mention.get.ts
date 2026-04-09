import { queryAll } from '~/server/utils/db';
import { VARCHAR } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const { q, type } = getQuery(event);
  if (!q || typeof q !== 'string') return [];

  const term = `%${q.trim()}%`;
  const params = { term };
  const types = { term: VARCHAR };

  if (type === 'task') {
    return await queryAll(
      "SELECT id, display_id, 'task' as type, title, completed FROM tasks WHERE archived = false AND (title ILIKE $term OR display_id ILIKE $term) ORDER BY updated_at DESC LIMIT 10",
      params, types
    );
  }

  if (type === 'note') {
    return await queryAll(
      "SELECT id, display_id, 'note' as type, title, false as completed FROM notes WHERE archived = false AND (title ILIKE $term OR display_id ILIKE $term) ORDER BY updated_at DESC LIMIT 10",
      params, types
    );
  }

  // Combined query when no type filter
  return await queryAll(`
    SELECT * FROM (
      SELECT id, display_id, 'task' as type, title, completed, updated_at FROM tasks WHERE archived = false AND (title ILIKE $term OR display_id ILIKE $term)
      UNION ALL
      SELECT id, display_id, 'note' as type, title, false as completed, updated_at FROM notes WHERE archived = false AND (title ILIKE $term OR display_id ILIKE $term)
    ) combined
    ORDER BY updated_at DESC LIMIT 10
  `, params, types);
});
