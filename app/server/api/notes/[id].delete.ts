import { queryAll, execute } from '~/server/utils/db';
import { VARCHAR } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id'));
  await execute("DELETE FROM links WHERE (source_type = 'note' AND source_id = $id) OR (target_type = 'note' AND target_id = $id)", { id }, { id: VARCHAR });
  const rows = await queryAll('DELETE FROM notes WHERE id = $id RETURNING id', { id }, { id: VARCHAR });
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Note not found' });
  return { deleted: true };
});
