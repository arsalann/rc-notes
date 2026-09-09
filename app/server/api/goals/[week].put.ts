import { queryAll } from '~/server/utils/db';
import { VARCHAR } from '@duckdb/node-api';

// Upsert the week's goals content. Keyed on the week's Sunday (YYYY-MM-DD). No uniqueness
// constraint exists on (week_start, workspace_id), so update-then-insert rather than ON CONFLICT.
export default defineEventHandler(async (event) => {
  const week = String(getRouterParam(event, 'week'));
  const body = await readBody(event);
  const content = body.content ?? '';
  const workspaceId = body.workspace_id || null;

  let where = 'week_start = $week::DATE';
  const params: Record<string, any> = { week, content };
  const types: Record<string, any> = { week: VARCHAR, content: VARCHAR };

  if (workspaceId) {
    where += ' AND workspace_id = $ws';
    params.ws = workspaceId;
    types.ws = VARCHAR;
  }

  const updated = await queryAll(
    `UPDATE goals_weekly SET content = $content, updated_at = current_timestamp WHERE ${where} RETURNING *`,
    params, types
  );
  if (updated.length) return updated[0];

  // No row for this week yet — create it with the content.
  let wsId = workspaceId;
  if (!wsId) {
    const { getDefaultWorkspaceId } = await import('~/server/utils/db');
    wsId = await getDefaultWorkspaceId();
  }

  const cols = ['id', 'week_start', 'content'];
  const vals = ['uuid()::VARCHAR', '$week::DATE', '$content'];
  const insertParams: Record<string, any> = { week, content };
  const insertTypes: Record<string, any> = { week: VARCHAR, content: VARCHAR };
  if (wsId) {
    cols.push('workspace_id');
    vals.push('$ws');
    insertParams.ws = wsId;
    insertTypes.ws = VARCHAR;
  }

  const created = await queryAll(
    `INSERT INTO goals_weekly (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING *`,
    insertParams, insertTypes
  );
  setResponseStatus(event, 201);
  return created[0];
});
