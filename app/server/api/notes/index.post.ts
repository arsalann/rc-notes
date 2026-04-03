import { queryAll } from '~/server/utils/db';
import { listValue, VARCHAR, LIST } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const title = body.title?.trim() || '';
  const content = body.content || '';
  const workspaceId = body.workspace_id || null;
  const tags = Array.isArray(body.tags) ? body.tags.filter((t: any) => typeof t === 'string' && t.trim()) : [];

  if (!title) throw createError({ statusCode: 400, statusMessage: 'Title is required' });

  const cols = ['id', 'title', 'content', 'tags'];
  const vals = ['uuid()::VARCHAR', '$title', '$content', '$tags'];
  const params: Record<string, any> = { title, content, tags: listValue(tags) };
  const types: Record<string, any> = { title: VARCHAR, content: VARCHAR, tags: LIST(VARCHAR) };

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
