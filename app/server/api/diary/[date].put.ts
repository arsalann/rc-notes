import { queryAll } from '~/server/utils/db';
import { VARCHAR } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const date = String(getRouterParam(event, 'date'));
  const body = await readBody(event);
  const content = body.content ?? '';
  const workspaceId = body.workspace_id || null;

  let where = "entry_date = $date::DATE";
  const params: Record<string, any> = { date, content };
  const types: Record<string, any> = { date: VARCHAR, content: VARCHAR };

  if (workspaceId) {
    where += " AND workspace_id = $ws";
    params.ws = workspaceId;
    types.ws = VARCHAR;
  } else {
    where += " AND workspace_id IS NULL";
  }

  const rows = await queryAll(
    `UPDATE diary_entries SET content = $content, updated_at = current_timestamp WHERE ${where} RETURNING *`,
    params, types
  );

  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Entry not found' });
  return rows[0];
});
