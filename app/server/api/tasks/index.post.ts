import { queryAll, getDefaultWorkspaceId, linkTaskToDiary } from '~/server/utils/db';
import { generateTaskDisplayId, generateSubtaskDisplayId } from '~/server/utils/ids';
import { isWithinNextDays } from '~/server/utils/dates';
import { withDerivedTaskTags } from '~/server/utils/taskTagPresenter';
import { listValue, VARCHAR, LIST, INTEGER } from '@duckdb/node-api';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const title = body.title?.trim() || '';
  const description = body.description?.trim() || '';
  const parentId = body.parent_id || null;
  const parentTask = parentId
    ? (await queryAll(
      'SELECT workspace_id, display_id, title, priority FROM tasks WHERE id = $pid',
      { pid: parentId }, { pid: VARCHAR },
    ))[0]
    : null;
  // For subtasks, inherit workspace from the parent task unless explicitly provided.
  let workspaceId: string | null;
  if (body.workspace_id !== undefined && body.workspace_id !== null) {
    workspaceId = body.workspace_id;
  } else if (parentId) {
    workspaceId = (parentTask?.workspace_id as string | null) ?? null;
  } else {
    workspaceId = await getDefaultWorkspaceId();
  }
  const tags = Array.isArray(body.tags) ? body.tags.filter((t: any) => typeof t === 'string' && t.trim()) : [];
  const dueAt = body.due_at || null;
  // Priority resolution: an explicit client value wins; a subtask otherwise inherits its parent's
  // priority (so it lands in the same kanban lane, not the "Focus" default); top-level tasks fall
  // back to 2 (Focus). Note 0 is a valid priority ("none"), so use ?? rather than || below.
  const explicitPriority = body.priority !== undefined && [0, 1, 2, 3].includes(Number(body.priority))
    ? Number(body.priority)
    : null;
  const parentPriority = parentTask && [0, 1, 2, 3].includes(Number(parentTask.priority))
    ? Number(parentTask.priority)
    : null;
  const priority = explicitPriority ?? parentPriority ?? 2;

  if (!title) throw createError({ statusCode: 400, statusMessage: 'Title is required' });

  // Generate display_id
  let displayId: string;
  if (parentId) {
    const parentDisplayId = parentTask?.display_id || parentId.slice(0, 8);
    displayId = await generateSubtaskDisplayId(parentDisplayId, parentId);
  } else {
    displayId = await generateTaskDisplayId(title, tags);
  }

  // New top-level tasks go to the TOP of the list (lowest position sorts first).
  // Subtasks keep appending to the bottom so their entry order is preserved.
  const posQuery = parentId
    ? 'SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM tasks WHERE parent_id = $pid'
    : 'SELECT COALESCE(MIN(position), 1) - 1 as next_pos FROM tasks WHERE parent_id IS NULL';
  const posParams = parentId ? { pid: parentId } : {};
  const posTypes = parentId ? { pid: VARCHAR } : undefined;
  const posRows = await queryAll(posQuery, posParams, posTypes);
  const position = posRows[0]?.next_pos ?? 0;

  // Accept explicit status from client, otherwise auto-set: 'now' if due within next 7 days, else 'next'
  const status = ['next', 'now', 'done'].includes(body.status)
    ? body.status
    : (dueAt && isWithinNextDays(dueAt, 7) ? 'now' : 'next');

  // A client may supply the id so that a retried create is the SAME write rather than a second task.
  // Without this, an optimistic client whose request times out has no safe move: dropping the local
  // row invites the user to retry and create a duplicate, keeping it risks a phantom.
  // `id` is the primary key, so ON CONFLICT below makes the create idempotent.
  const clientId = typeof body.id === 'string' && UUID_RE.test(body.id.trim()) ? body.id.trim() : null;

  const cols = ['id', 'title', 'description', 'tags', 'position', 'display_id', 'status', 'priority'];
  const vals = [clientId ? '$id' : 'uuid()::VARCHAR', '$title', '$description', '$tags', '$position', '$display_id', '$status', '$priority'];
  const params: Record<string, any> = { title, description, tags: listValue(tags), position, display_id: displayId, status, priority };
  const types: Record<string, any> = { title: VARCHAR, description: VARCHAR, tags: LIST(VARCHAR), position: INTEGER, display_id: VARCHAR, status: VARCHAR, priority: INTEGER };
  if (clientId) {
    params.id = clientId;
    types.id = VARCHAR;
  }

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
    `INSERT INTO tasks (${cols.join(', ')}) VALUES (${vals.join(', ')})
     ${clientId ? 'ON CONFLICT (id) DO NOTHING' : ''} RETURNING *`,
    params, types
  );

  // No rows means this exact id already exists — a retry of a create that actually succeeded.
  // Return the stored row and skip the side effects, so the retry is a no-op rather than a duplicate.
  if (!rows.length && clientId) {
    const existing = await queryAll(
      `SELECT t.*, p.title AS parent_title FROM tasks t
       LEFT JOIN tasks p ON p.id = t.parent_id WHERE t.id = $id`,
      { id: clientId }, { id: VARCHAR }
    );
    if (existing.length) {
      setResponseStatus(event, 200);
      return withDerivedTaskTags(existing[0]);
    }
  }

  const task = rows[0];
  if (!task) throw createError({ statusCode: 500, statusMessage: 'Task could not be created' });

  // Auto-link task to diary entry for the due date
  if (dueAt && !parentId) {
    await linkTaskToDiary(task.id, dueAt, workspaceId).catch(() => {});
  }

  setResponseStatus(event, 201);
  return withDerivedTaskTags(task, (parentTask?.title as string | null | undefined) ?? null);
});
