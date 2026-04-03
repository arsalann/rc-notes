import { queryAll } from '~/server/utils/db';
import { listValue, VARCHAR, LIST, BOOLEAN } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id'));
  const body = await readBody(event);

  const sets: string[] = [];
  const params: Record<string, any> = { id };
  const types: Record<string, any> = { id: VARCHAR };

  if (body.title !== undefined) { sets.push('title = $title'); params.title = body.title.trim(); types.title = VARCHAR; }
  if (body.content !== undefined) { sets.push('content = $content'); params.content = body.content; types.content = VARCHAR; }
  if (body.tags !== undefined) { sets.push('tags = $tags'); params.tags = listValue(Array.isArray(body.tags) ? body.tags : []); types.tags = LIST(VARCHAR); }
  if (body.pinned !== undefined) { sets.push('pinned = $pinned'); params.pinned = Boolean(body.pinned); types.pinned = BOOLEAN; }
  if (body.archived !== undefined) { sets.push('archived = $archived'); params.archived = Boolean(body.archived); types.archived = BOOLEAN; }
  if (body.workspace_id !== undefined) {
    if (body.workspace_id === null) { sets.push('workspace_id = NULL'); }
    else { sets.push('workspace_id = $workspace_id'); params.workspace_id = body.workspace_id; types.workspace_id = VARCHAR; }
  }

  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'No fields to update' });
  sets.push('updated_at = current_timestamp');

  const rows = await queryAll(`UPDATE notes SET ${sets.join(', ')} WHERE id = $id RETURNING *`, params, types);
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Note not found' });
  return rows[0];
});
