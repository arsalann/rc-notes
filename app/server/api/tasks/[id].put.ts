import { queryAll } from '~/server/utils/db';
import { listValue, VARCHAR, LIST, BOOLEAN, INTEGER } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id'));
  const body = await readBody(event);

  const sets: string[] = [];
  const params: Record<string, any> = { id };
  const types: Record<string, any> = { id: VARCHAR };

  if (body.title !== undefined) {
    sets.push('title = $title');
    params.title = body.title.trim();
    types.title = VARCHAR;
  }
  if (body.description !== undefined) {
    sets.push('description = $description');
    params.description = body.description;
    types.description = VARCHAR;
  }
  if (body.tags !== undefined) {
    sets.push('tags = $tags');
    params.tags = listValue(Array.isArray(body.tags) ? body.tags : []);
    types.tags = LIST(VARCHAR);
  }
  if (body.pinned !== undefined) {
    sets.push('pinned = $pinned');
    params.pinned = Boolean(body.pinned);
    types.pinned = BOOLEAN;
  }
  if (body.archived !== undefined) {
    sets.push('archived = $archived');
    params.archived = Boolean(body.archived);
    types.archived = BOOLEAN;
  }
  if (body.position !== undefined) {
    sets.push('position = $position');
    params.position = Number(body.position);
    types.position = INTEGER;
  }
  if (body.due_at !== undefined) {
    if (body.due_at === null) {
      sets.push('due_at = NULL');
    } else {
      sets.push('due_at = $due_at::TIMESTAMP');
      params.due_at = body.due_at;
      types.due_at = VARCHAR;
    }
  }
  if (body.workspace_id !== undefined) {
    if (body.workspace_id === null) {
      sets.push('workspace_id = NULL');
    } else {
      sets.push('workspace_id = $workspace_id');
      params.workspace_id = body.workspace_id;
      types.workspace_id = VARCHAR;
    }
  }
  if (body.status !== undefined && ['next', 'now', 'done'].includes(body.status)) {
    sets.push('status = $status');
    params.status = body.status;
    types.status = VARCHAR;
    // Sync completed flag with status
    sets.push('completed = $status_completed');
    params.status_completed = body.status === 'done';
    types.status_completed = BOOLEAN;
    if (body.status === 'done') {
      sets.push("completed_at = COALESCE(completed_at, current_timestamp)");
    } else {
      sets.push('completed_at = NULL');
    }
  }

  if (!sets.length) {
    throw createError({ statusCode: 400, statusMessage: 'No fields to update' });
  }

  sets.push('updated_at = current_timestamp');

  const rows = await queryAll(
    `UPDATE tasks SET ${sets.join(', ')} WHERE id = $id RETURNING *`,
    params,
    types
  );

  if (!rows.length) {
    throw createError({ statusCode: 404, statusMessage: 'Task not found' });
  }

  return rows[0];
});
