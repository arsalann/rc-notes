import { queryAll } from '~/server/utils/db';

export default defineEventHandler(async () => {
  const rows = await queryAll(`
    SELECT
      count(*) FILTER (WHERE parent_id IS NULL)::INTEGER as total_tasks,
      count(*) FILTER (WHERE parent_id IS NULL AND completed = false AND archived = false)::INTEGER as open_tasks,
      count(*) FILTER (WHERE parent_id IS NULL AND completed = true AND archived = false)::INTEGER as done_tasks,
      count(*) FILTER (WHERE parent_id IS NULL AND archived = true)::INTEGER as archived_tasks,
      count(*) FILTER (WHERE parent_id IS NULL AND due_at IS NOT NULL AND due_at < current_timestamp AND completed = false AND archived = false)::INTEGER as overdue_tasks
    FROM tasks
  `);

  return rows[0] || { total_tasks: 0, open_tasks: 0, done_tasks: 0, archived_tasks: 0, overdue_tasks: 0 };
});
