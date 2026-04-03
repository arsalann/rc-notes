/* @bruin
name: public.tasks
type: duckdb.sql
materialization:
  type: table

columns:
  - name: id
    type: varchar
    primary_key: true
    checks:
      - name: not_null
      - name: unique
  - name: workspace_id
    type: varchar
  - name: parent_id
    type: varchar
  - name: title
    type: varchar
    checks:
      - name: not_null
  - name: completed
    type: boolean
    checks:
      - name: not_null
  - name: position
    type: integer
    checks:
      - name: not_null
  - name: created_at
    type: timestamp
    checks:
      - name: not_null
  - name: updated_at
    type: timestamp
    checks:
      - name: not_null

@bruin */

SELECT
    uuid()::VARCHAR as id, NULL::VARCHAR as workspace_id, NULL::VARCHAR as parent_id,
    '' as title, '' as description, false as completed, NULL::TIMESTAMP as completed_at,
    false as pinned, false as archived, NULL::TIMESTAMP as due_at,
    []::VARCHAR[] as tags, 0::INTEGER as position,
    current_timestamp as created_at, current_timestamp as updated_at
WHERE false;
