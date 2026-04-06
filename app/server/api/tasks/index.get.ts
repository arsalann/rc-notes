import { queryAll } from '~/server/utils/db';
import { BOOLEAN, VARCHAR } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const archived = query.archived === 'true';
  const workspaceId = query.workspace_id as string | undefined;

  let where = 'WHERE t.parent_id IS NULL AND t.archived = $archived';
  const params: Record<string, any> = { archived };
  const types: Record<string, any> = { archived: BOOLEAN };

  if (workspaceId) {
    where += ' AND t.workspace_id = $workspace_id';
    params.workspace_id = workspaceId;
    types.workspace_id = VARCHAR;
  }

  return await queryAll(`
    SELECT t.id, t.display_id, t.workspace_id, t.title, t.description, t.status, t.completed, t.completed_at,
      t.pinned, t.archived, t.due_at, t.tags, t.position,
      t.created_at, t.updated_at,
      (SELECT count(*)::INTEGER FROM tasks s WHERE s.parent_id = t.id) as subtask_count,
      (SELECT count(*)::INTEGER FROM tasks s WHERE s.parent_id = t.id AND s.completed = true) as subtask_done
    FROM tasks t
    ${where}
    ORDER BY t.completed ASC, t.pinned DESC, t.position ASC, t.created_at DESC
  `, params, types);
});
