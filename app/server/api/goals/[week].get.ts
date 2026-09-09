import { queryAll } from '~/server/utils/db';
import { VARCHAR } from '@duckdb/node-api';

// Weekly goals are shared across every day of the same week. The route param is the week's
// Sunday (YYYY-MM-DD). Get-or-create: unlike diary this has no side effects on other tables,
// so lazily creating the empty row on read is safe and keeps the client to a single request.
export default defineEventHandler(async (event) => {
  const week = String(getRouterParam(event, 'week'));
  const { workspace_id } = getQuery(event);

  let where = 'week_start = $week::DATE';
  const params: Record<string, any> = { week };
  const types: Record<string, any> = { week: VARCHAR };

  if (workspace_id) {
    where += ' AND workspace_id = $ws';
    params.ws = workspace_id;
    types.ws = VARCHAR;
  }

  const rows = await queryAll(`SELECT * FROM goals_weekly WHERE ${where}`, params, types);
  if (rows.length) return rows[0];

  // None yet — create an empty entry for this week, defaulting to the Work workspace.
  let wsId = (workspace_id as string) || null;
  if (!wsId) {
    const { getDefaultWorkspaceId } = await import('~/server/utils/db');
    wsId = await getDefaultWorkspaceId();
  }

  const cols = ['id', 'week_start'];
  const vals = ['uuid()::VARCHAR', '$week::DATE'];
  const insertParams: Record<string, any> = { week };
  const insertTypes: Record<string, any> = { week: VARCHAR };
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
