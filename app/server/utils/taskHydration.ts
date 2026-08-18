import { queryAll } from '~/server/utils/db';
import { withDerivedTaskTags } from '~/server/utils/taskTagPresenter';
import { listValue, LIST, VARCHAR } from '@duckdb/node-api';

/**
 * Hydrate a set of task IDs into exactly the shape `GET /api/tasks/[id]` returns — the full row plus
 * a joined `parent_title` and a nested `subtasks[]`.
 *
 * Two queries regardless of how many IDs are passed. This replaces the diary page's N+1: it used to
 * issue one `/api/tasks/{id}` request per linked task, each of which was 2 SELECTs plus an
 * event_log INSERT, all serialized behind the single shared DuckDB connection.
 *
 * `parent_title` matters and is easy to drop by accident: `withDerivedTaskTags` uses it to resolve
 * tag icons, so omitting the LEFT JOIN makes tags silently differ from the per-ID endpoint rather
 * than fail loudly.
 */
export async function hydrateTasksByIds(ids: string[]) {
  const unique = [...new Set(ids.map(String).filter(Boolean))];
  if (!unique.length) return [];

  const idList = listValue(unique);

  // Sequential on purpose: useDB() memoizes one shared connection, so Promise.all here would not
  // overlap anything. Reducing the number of round trips is the only lever that works.
  const parents = await queryAll(
    `SELECT t.*, p.title AS parent_title
     FROM tasks t
     LEFT JOIN tasks p ON p.id = t.parent_id
     WHERE list_contains($ids, t.id)`,
    { ids: idList },
    { ids: LIST(VARCHAR) }
  );
  const subtasks = await queryAll(
    `SELECT t.*, p.title AS parent_title
     FROM tasks t
     LEFT JOIN tasks p ON p.id = t.parent_id
     WHERE list_contains($ids, t.parent_id)
     ORDER BY t.completed ASC, t.position ASC`,
    { ids: idList },
    { ids: LIST(VARCHAR) }
  );

  const subsByParent = new Map<string, Record<string, any>[]>();
  for (const sub of subtasks) {
    const key = String(sub.parent_id);
    if (!subsByParent.has(key)) subsByParent.set(key, []);
    subsByParent.get(key)!.push(sub);
  }

  return parents.map(task => ({
    ...withDerivedTaskTags(task),
    subtasks: (subsByParent.get(String(task.id)) || []).map(sub => withDerivedTaskTags(sub)),
  }));
}

/** Pull the task IDs out of a diary entry's `links` array. */
export function taskIdsFromLinks(links: Record<string, any>[]): string[] {
  return links.filter(l => l.target_type === 'task').map(l => String(l.target_id));
}
