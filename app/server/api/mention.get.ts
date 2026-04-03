import { queryAll } from '~/server/utils/db';
import { VARCHAR } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const { q, type } = getQuery(event);
  if (!q || typeof q !== 'string') return [];

  const term = `%${q.trim()}%`;
  const params = { term };
  const types = { term: VARCHAR };
  const results: any[] = [];

  if (!type || type === 'task') {
    const tasks = await queryAll(
      "SELECT id, 'task' as type, title, completed FROM tasks WHERE archived = false AND title ILIKE $term ORDER BY updated_at DESC LIMIT 10",
      params, types
    );
    results.push(...tasks);
  }

  if (!type || type === 'note') {
    const notes = await queryAll(
      "SELECT id, 'note' as type, title, false as completed FROM notes WHERE archived = false AND title ILIKE $term ORDER BY updated_at DESC LIMIT 10",
      params, types
    );
    results.push(...notes);
  }

  return results;
});
