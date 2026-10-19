import { queryAll } from '~/server/utils/db';
import { withDerivedTaskTags } from '~/server/utils/taskTagPresenter';
import { listValue, LIST, VARCHAR, INTEGER, BOOLEAN } from '~/server/utils/sqlTypes';

/**
 * `POST /api/tasks/bulk` — body `{ ids: string[], action, value? }`
 *
 * One request for the multi-select bar (Tasks and Today pages):
 * - `archive` / `unarchive`: archiving also archives the tasks' subtasks (as `DELETE /api/tasks/:id`
 *   does); unarchiving restores only the selected tasks.
 * - `status` (`value`: next | now | done) and `priority` (`value`: 0..3): same rules as `PUT`.
 * - `delete`: removes the tasks, their subtasks and every link to them for good. Each deleted row
 *   is kept in `sync_tombstones.row_data` (the tombstone trigger), which also tells the iOS app to
 *   drop its copy.
 *
 * Every action is an absolute set, so a retried request changes nothing more.
 * Returns `{ action, ids, tasks }`: the rows as stored after the change (empty for `delete`).
 */
const MAX_IDS = 500;
const ACTIONS = ['archive', 'unarchive', 'delete', 'status', 'priority'] as const;
type Action = typeof ACTIONS[number];

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const action = body?.action as Action;
  if (!ACTIONS.includes(action)) {
    throw createError({ statusCode: 400, statusMessage: `action must be one of ${ACTIONS.join(', ')}` });
  }
  const ids: string[] = Array.isArray(body?.ids)
    ? [...new Set<string>(body.ids.filter((id: unknown) => typeof id === 'string' && id.trim()).map((id: string) => id.trim()))]
    : [];
  if (!ids.length) throw createError({ statusCode: 400, statusMessage: 'ids must be a non-empty array' });
  if (ids.length > MAX_IDS) throw createError({ statusCode: 400, statusMessage: `Too many ids (max ${MAX_IDS})` });

  const params: Record<string, any> = { ids: listValue(ids) };
  const types: Record<string, any> = { ids: LIST(VARCHAR) };
  let rows: Record<string, any>[] = [];

  if (action === 'archive') {
    await queryAll(
      `UPDATE tasks SET archived = true, updated_at = current_timestamp
       WHERE parent_id = ANY($ids) AND archived = false`,
      params, types,
    );
    rows = await queryAll(
      'UPDATE tasks SET archived = true, updated_at = current_timestamp WHERE id = ANY($ids) RETURNING *',
      params, types,
    );
  } else if (action === 'unarchive') {
    rows = await queryAll(
      'UPDATE tasks SET archived = false, updated_at = current_timestamp WHERE id = ANY($ids) RETURNING *',
      params, types,
    );
  } else if (action === 'status') {
    const status = body.value;
    if (!['next', 'now', 'done'].includes(status)) {
      throw createError({ statusCode: 400, statusMessage: 'status must be next, now or done' });
    }
    params.status = status;
    params.completed = status === 'done';
    types.status = VARCHAR;
    types.completed = BOOLEAN;
    rows = await queryAll(
      `UPDATE tasks SET status = $status, completed = $completed,
         completed_at = CASE WHEN $completed THEN COALESCE(completed_at, current_timestamp) ELSE NULL END,
         updated_at = current_timestamp
       WHERE id = ANY($ids) RETURNING *`,
      params, types,
    );
  } else if (action === 'priority') {
    const priority = Number(body.value);
    if (![0, 1, 2, 3].includes(priority)) {
      throw createError({ statusCode: 400, statusMessage: 'priority must be 0, 1, 2 or 3' });
    }
    params.priority = priority;
    types.priority = INTEGER;
    rows = await queryAll(
      'UPDATE tasks SET priority = $priority, updated_at = current_timestamp WHERE id = ANY($ids) RETURNING *',
      params, types,
    );
  } else {
    // Subtasks (at any depth) go with their parent; links to any of them would point at nothing.
    const doomed = (await queryAll(
      `WITH RECURSIVE tree AS (
         SELECT id FROM tasks WHERE id = ANY($ids)
         UNION SELECT t.id FROM tasks t JOIN tree ON t.parent_id = tree.id
       ) SELECT id FROM tree`,
      params, types,
    )).map(r => String(r.id));
    if (doomed.length) {
      const doomedParams = { ids: listValue(doomed) };
      await queryAll(
        `DELETE FROM links WHERE (source_type = 'task' AND source_id = ANY($ids))
           OR (target_type = 'task' AND target_id = ANY($ids))`,
        doomedParams, types,
      );
      await queryAll('DELETE FROM tasks WHERE id = ANY($ids)', doomedParams, types);
    }
    return { action, ids: doomed, tasks: [] };
  }

  // Parent titles feed tag resolution for subtasks; one query for all of them.
  const parentIds = [...new Set(rows.map(r => r.parent_id).filter(Boolean).map(String))];
  const parentTitles = new Map<string, string>();
  if (parentIds.length) {
    const parents = await queryAll(
      'SELECT id, title FROM tasks WHERE id = ANY($ids)',
      { ids: listValue(parentIds) }, types,
    );
    for (const p of parents) parentTitles.set(String(p.id), String(p.title));
  }

  return {
    action,
    ids: rows.map(r => String(r.id)),
    tasks: rows.map(r => withDerivedTaskTags(r, r.parent_id ? parentTitles.get(String(r.parent_id)) ?? null : null)),
  };
});
