import { validateOwnedReferences } from '~/server/utils/ownership';
import { queryAll } from '~/server/utils/db';
import { generateNoteDisplayId, clientId } from '~/server/utils/ids';
import { listValue, VARCHAR, LIST } from '~/server/utils/sqlTypes';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  await validateOwnedReferences(body || {});
  const title = body.title?.trim() || '';
  const content = body.content || '';
  const workspaceId = body.workspace_id || null;
  const tags = Array.isArray(body.tags) ? body.tags.filter((t: any) => typeof t === 'string' && t.trim()) : [];

  if (!title) throw createError({ statusCode: 400, statusMessage: 'Title is required' });

  // A client-chosen id makes a replayed create (offline queue, retry) return the same note.
  const id = clientId(body.id);
  if (id) {
    const existing = await queryAll('SELECT * FROM notes WHERE id = $id', { id }, { id: VARCHAR });
    if (existing.length) return existing[0];
  }

  const displayId = await generateNoteDisplayId(title, tags);

  const cols = ['id', 'title', 'content', 'tags', 'display_id'];
  const vals = [id ? '$id' : 'gen_random_uuid()::text', '$title', '$content', '$tags', '$display_id'];
  const params: Record<string, any> = { title, content, tags: listValue(tags), display_id: displayId };
  const types: Record<string, any> = { title: VARCHAR, content: VARCHAR, tags: LIST(VARCHAR), display_id: VARCHAR };
  if (id) {
    params.id = id;
    types.id = VARCHAR;
  }

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
