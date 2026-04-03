import { queryAll } from '~/server/utils/db';
import { VARCHAR } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id'));
  const rows = await queryAll('SELECT * FROM notes WHERE id = $id', { id }, { id: VARCHAR });
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Note not found' });

  // Fetch linked items
  const links = await queryAll(`
    SELECT l.id as link_id, l.target_type, l.target_id,
      CASE WHEN l.target_type = 'task' THEN (SELECT title FROM tasks WHERE id = l.target_id)
           WHEN l.target_type = 'note' THEN (SELECT title FROM notes WHERE id = l.target_id)
      END as target_title
    FROM links l WHERE l.source_type = 'note' AND l.source_id = $id
    UNION ALL
    SELECT l.id as link_id, l.source_type as target_type, l.source_id as target_id,
      CASE WHEN l.source_type = 'task' THEN (SELECT title FROM tasks WHERE id = l.source_id)
           WHEN l.source_type = 'note' THEN (SELECT title FROM notes WHERE id = l.source_id)
      END as target_title
    FROM links l WHERE l.target_type = 'note' AND l.target_id = $id
  `, { id }, { id: VARCHAR });

  return { ...rows[0], links };
});
