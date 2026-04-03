/* @bruin
name: analytics.daily_summary
type: duckdb.sql
materialization:
  type: table

depends:
  - public.tasks

@bruin */

SELECT
    current_date as report_date,
    count(*) FILTER (WHERE parent_id IS NULL)::INTEGER as total_tasks,
    count(*) FILTER (WHERE parent_id IS NULL AND completed = false AND archived = false)::INTEGER as open_tasks,
    count(*) FILTER (WHERE parent_id IS NULL AND completed = true AND archived = false)::INTEGER as done_tasks,
    count(*) FILTER (WHERE parent_id IS NULL AND archived = true)::INTEGER as archived_tasks,
    count(*) FILTER (WHERE parent_id IS NOT NULL)::INTEGER as total_subtasks,
    count(*) FILTER (WHERE parent_id IS NULL AND due_at IS NOT NULL AND due_at < current_timestamp AND completed = false)::INTEGER as overdue_tasks
FROM tasks;
