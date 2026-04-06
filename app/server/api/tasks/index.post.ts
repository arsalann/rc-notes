import { queryAll } from '~/server/utils/db';
import { generateTaskDisplayId, generateSubtaskDisplayId } from '~/server/utils/ids';
import { listValue, VARCHAR, LIST, INTEGER } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const title = body.title?.trim() || '';
  const description = body.description?.trim() || '';
  const parentId = body.parent_id || null;
  const workspaceId = body.workspace_id || null;
  const tags = Array.isArray(body.tags) ? body.tags.filter((t: any) => typeof t === 'string' && t.trim()) : [];
  const dueAt = body.due_at || null;

  if (!title) throw createError({ statusCode: 400, statusMessage: 'Title is required' });

  // Generate display_id
  let displayId: string;
  if (parentId) {
    // Get parent's display_id
    const parentRows = await queryAll(
      'SELECT display_id FROM tasks WHERE id = $pid',
      { pid: parentId }, { pid: VARCHAR }
    );
    const parentDisplayId = parentRows[0]?.display_id || parentId.slice(0, 8);
    displayId = await generateSubtaskDisplayId(parentDisplayId, parentId);
  } else {
    displayId = await generateTaskDisplayId(title, tags);
  }

  const posQuery = parentId
    ? 'SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM tasks WHERE parent_id = $pid'
    : 'SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM tasks WHERE parent_id IS NULL';
  const posParams = parentId ? { pid: parentId } : {};
  const posTypes = parentId ? { pid: VARCHAR } : undefined;
  const posRows = await queryAll(posQuery, posParams, posTypes);
  const position = posRows[0]?.next_pos ?? 0;

  // Determine status: 'now' if due today, otherwise 'next'
  const today = new Date().toISOString().split('T')[0];
  const isDueToday = dueAt && new Date(dueAt).toISOString().split('T')[0] === today;
  const status = isDueToday ? 'now' : 'next';

  const cols = ['id', 'title', 'description', 'tags', 'position', 'display_id', 'status'];
  const vals = ['uuid()::VARCHAR', '$title', '$description', '$tags', '$position', '$display_id', '$status'];
  const params: Record<string, any> = { title, description, tags: listValue(tags), position, display_id: displayId, status };
  const types: Record<string, any> = { title: VARCHAR, description: VARCHAR, tags: LIST(VARCHAR), position: INTEGER, display_id: VARCHAR, status: VARCHAR };

  if (parentId) {
    cols.push('parent_id');
    vals.push('$parent_id');
    params.parent_id = parentId;
    types.parent_id = VARCHAR;
  }
  if (workspaceId) {
    cols.push('workspace_id');
    vals.push('$workspace_id');
    params.workspace_id = workspaceId;
    types.workspace_id = VARCHAR;
  }
  if (dueAt) {
    cols.push('due_at');
    vals.push('$due_at::TIMESTAMP');
    params.due_at = dueAt;
    types.due_at = VARCHAR;
  }

  const rows = await queryAll(
    `INSERT INTO tasks (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING *`,
    params, types
  );

  setResponseStatus(event, 201);
  return rows[0];
});
