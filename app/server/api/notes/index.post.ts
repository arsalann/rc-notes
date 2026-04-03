import { queryAll } from '~/server/utils/db';
import { generateNoteDisplayId } from '~/server/utils/ids';
import { listValue, VARCHAR, LIST } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const title = body.title?.trim() || '';
  const content = body.content || '';
  const workspaceId = body.workspace_id || null;
  const tags = Array.isArray(body.tags) ? body.tags.filter((t: any) => typeof t === 'string' && t.trim()) : [];

  if (!title) throw createError({ statusCode: 400, statusMessage: 'Title is required' });

  const displayId = await generateNoteDisplayId(title, tags);

  const cols = ['id', 'title', 'content', 'tags', 'display_id'];
  const vals = ['uuid()::VARCHAR', '$title', '$content', '$tags', '$display_id'];
  const params: Record<string, any> = { title, content, tags: listValue(tags), display_id: displayId };
  const types: Record<string, any> = { title: VARCHAR, content: VARCHAR, tags: LIST(VARCHAR), display_id: VARCHAR };

  if (workspaceId) {
    cols.push('workspace_id');
    vals.push('$workspace_id');
    params.workspace_id = workspaceId;
    types.workspace_id = VARCHAR;
  }

  const rows = await queryAll(
    `INSERT INTO notes (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING *`,
    params, types
  );
  setResponseStatus(event, 201);
  return rows[0];
});
