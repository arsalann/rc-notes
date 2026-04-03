import { queryAll } from '~/server/utils/db';
import { VARCHAR } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const workspaceId = query.workspace_id as string | undefined;

  // 5-day window: 2 days before + today + 2 days after
  let where = "WHERE t.due_at IS NOT NULL AND t.archived = false AND t.due_at::DATE >= current_date - INTERVAL '2 days' AND t.due_at::DATE <= current_date + INTERVAL '2 days'";
  const params: Record<string, any> = {};
  const types: Record<string, any> = {};

  if (workspaceId) {
    where += ' AND t.workspace_id = $workspace_id';
    params.workspace_id = workspaceId;
    types.workspace_id = VARCHAR;
  }

  const tasks = await queryAll(`
    SELECT t.id, t.title, t.completed, t.pinned, t.due_at, t.tags,
      t.due_at::DATE as due_date
    FROM tasks t
    ${where}
    ORDER BY t.due_at ASC
  `, params, Object.keys(types).length ? types : undefined);

  // Group by date
  const days: Record<string, any[]> = {};
  for (let i = -2; i <= 2; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const key = d.toISOString().split('T')[0];
    days[key] = [];
  }

  for (const task of tasks) {
    const dateKey = typeof task.due_date === 'string'
      ? task.due_date.split('T')[0]
      : String(task.due_date);
    if (days[dateKey]) {
      days[dateKey].push(task);
    }
  }

  return Object.entries(days).map(([date, items]) => ({ date, tasks: items }));
});
