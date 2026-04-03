import { queryAll } from '~/server/utils/db';
import { BOOLEAN, VARCHAR } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const archived = query.archived === 'true';
  const workspaceId = query.workspace_id as string | undefined;

  let where = 'WHERE archived = $archived';
  const params: Record<string, any> = { archived };
  const types: Record<string, any> = { archived: BOOLEAN };

  if (workspaceId) {
    where += ' AND workspace_id = $workspace_id';
    params.workspace_id = workspaceId;
    types.workspace_id = VARCHAR;
  }

  return await queryAll(`
    SELECT id, workspace_id, title,
      CASE WHEN length(content) > 200 THEN substring(content, 1, 200) || '...' ELSE content END as preview,
      pinned, archived, tags, created_at, updated_at
    FROM notes
    ${where}
    ORDER BY pinned DESC, updated_at DESC
  `, params, types);
});
