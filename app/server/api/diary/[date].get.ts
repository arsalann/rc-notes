import { queryAll } from '~/server/utils/db';
import { VARCHAR } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const date = String(getRouterParam(event, 'date'));
  const { workspace_id } = getQuery(event);

  let where = "entry_date = $date::DATE";
  const params: Record<string, any> = { date };
  const types: Record<string, any> = { date: VARCHAR };

  if (workspace_id) {
    where += " AND workspace_id = $ws";
    params.ws = workspace_id;
    types.ws = VARCHAR;
  } else {
    where += " AND workspace_id IS NULL";
  }

  const rows = await queryAll(`SELECT * FROM diary_entries WHERE ${where}`, params, types);
  if (!rows.length) {
    throw createError({ statusCode: 404, statusMessage: 'No entry for this date' });
  }

  const entry = rows[0];

  // Fetch linked items
  const links = await queryAll(`
    SELECT l.id as link_id, l.target_type, l.target_id,
      CASE WHEN l.target_type = 'task' THEN (SELECT title FROM tasks WHERE id = l.target_id)
           WHEN l.target_type = 'note' THEN (SELECT title FROM notes WHERE id = l.target_id)
      END as target_title
    FROM links l WHERE l.source_type = 'diary' AND l.source_id = $id
  `, { id: entry.id }, { id: VARCHAR });

  return { ...entry, links };
});
