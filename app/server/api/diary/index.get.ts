import { queryAll } from '~/server/utils/db';
import { VARCHAR } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const { workspace_id } = getQuery(event);

  let workspaceFilter = '';
  const params: Record<string, any> = {};
  const types: Record<string, any> = {};

  if (workspace_id) {
    workspaceFilter = ' AND workspace_id = $workspace_id';
    params.workspace_id = String(workspace_id);
    types.workspace_id = VARCHAR;
  }

  return await queryAll(`
    SELECT
      id,
      workspace_id,
      entry_date::VARCHAR AS entry_date,
      content,
      CASE
        WHEN length(content) > 200 THEN substring(content, 1, 200) || '...'
        ELSE content
      END AS preview,
      created_at,
      updated_at
    FROM diary_entries
    WHERE deleted_at IS NULL
      AND content IS NOT NULL
      AND trim(content) != ''
      ${workspaceFilter}
    ORDER BY entry_date DESC, updated_at DESC
  `, params, types);
});
