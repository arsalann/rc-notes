/* @bruin
name: analytics.tag_counts
type: duckdb.sql
materialization:
  type: table

depends:
  - public.tasks

@bruin */

SELECT tag, sum(cnt)::INTEGER as usage_count FROM (
    SELECT tag, count(*) as cnt FROM (
        SELECT unnest(tags) as tag FROM tasks WHERE archived = false
    ) GROUP BY tag
    UNION ALL
    SELECT tag, count(*) as cnt FROM (
        SELECT unnest(tags) as tag FROM notes WHERE archived = false
    ) GROUP BY tag
) GROUP BY tag ORDER BY usage_count DESC;
