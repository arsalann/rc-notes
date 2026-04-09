import { queryAll } from '~/server/utils/db';
import { VARCHAR } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id'));
  const rows = await queryAll('SELECT * FROM notes WHERE id = $id', { id }, { id: VARCHAR });
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Note not found' });

  // Fetch linked items
  const links = await queryAll(`
    SELECT l.id as link_id, l.target_type, l.target_id,
      COALESCE(t.title, n.title) as target_title
    FROM links l
    LEFT JOIN tasks t ON l.target_type = 'task' AND t.id = l.target_id
    LEFT JOIN notes n ON l.target_type = 'note' AND n.id = l.target_id
    WHERE l.source_type = 'note' AND l.source_id = $id
    UNION ALL
    SELECT l.id as link_id, l.source_type as target_type, l.source_id as target_id,
      COALESCE(t2.title, n2.title) as target_title
    FROM links l
    LEFT JOIN tasks t2 ON l.source_type = 'task' AND t2.id = l.source_id
    LEFT JOIN notes n2 ON l.source_type = 'note' AND n2.id = l.source_id
    WHERE l.target_type = 'note' AND l.target_id = $id
  `, { id }, { id: VARCHAR });

  return { ...rows[0], links };
});
