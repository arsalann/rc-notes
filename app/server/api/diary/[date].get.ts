import { queryAll } from '~/server/utils/db';
import { VARCHAR } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const date = String(getRouterParam(event, 'date'));
  const { workspace_id } = getQuery(event);

  let where = "entry_date = $date::DATE";
  const params: Record<string, any> = { date };
  const types: Record<string, any> = { date: VARCHAR };

  if (workspace_id) {
    where += " AND workspace_id = $ws";
    params.ws = workspace_id;
    types.ws = VARCHAR;
  }

  const rows = await queryAll(`SELECT * FROM diary_entries WHERE ${where}`, params, types);
  if (!rows.length) {
    throw createError({ statusCode: 404, statusMessage: 'No entry for this date' });
  }

  const entry = rows[0];

  // Auto-bump overdue tasks: move incomplete tasks with past due dates to today
  // Server uses UTC — compare the requested date against task due dates
  const overdueTasks = await queryAll(`
    SELECT id FROM tasks
    WHERE due_at IS NOT NULL
      AND due_at::DATE < $date::DATE
      AND completed = false
      AND (deleted_at IS NULL)
  `, { date }, { date: VARCHAR });

  if (overdueTasks.length) {
    const newDueAt = `${date}T12:00:00`;
    for (const task of overdueTasks) {
      // Update due date to today
      await queryAll(
        `UPDATE tasks SET due_at = $due::TIMESTAMP, updated_at = now() WHERE id = $tid`,
        { due: newDueAt, tid: task.id as string },
        { due: VARCHAR, tid: VARCHAR }
      ).catch(() => {});

      // Link to today's diary entry if not already linked
      await queryAll(
        `INSERT INTO links (id, source_type, source_id, target_type, target_id)
         SELECT uuid()::VARCHAR, 'diary', $did, 'task', $tid
         WHERE NOT EXISTS (
           SELECT 1 FROM links WHERE source_type = 'diary' AND source_id = $did AND target_type = 'task' AND target_id = $tid
         )`,
        { did: entry.id as string, tid: task.id as string },
        { did: VARCHAR, tid: VARCHAR }
      ).catch(() => {});
    }
  }

  // Fetch linked items
  const links = await queryAll(`
    SELECT l.id as link_id, l.target_type, l.target_id,
      CASE WHEN l.target_type = 'task' THEN (SELECT title FROM tasks WHERE id = l.target_id)
           WHEN l.target_type = 'note' THEN (SELECT title FROM notes WHERE id = l.target_id)
      END as target_title
    FROM links l WHERE l.source_type = 'diary' AND l.source_id = $id
  `, { id: entry.id }, { id: VARCHAR });

  // Auto-set due_at on linked tasks that don't have one yet
  const taskLinks = links.filter((l: any) => l.target_type === 'task');
  if (taskLinks.length) {
    const dueAt = `${date}T12:00:00`;
    for (const link of taskLinks) {
      await queryAll(
        `UPDATE tasks SET due_at = $due_at::TIMESTAMP, updated_at = now()
         WHERE id = $tid AND due_at IS NULL`,
        { due_at: dueAt, tid: link.target_id },
        { due_at: VARCHAR, tid: VARCHAR }
      ).catch(() => {});
    }
  }

  return { ...entry, links };
});
