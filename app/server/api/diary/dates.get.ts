import { queryAll } from '~/server/utils/db';
import { VARCHAR } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const { from, to, workspace_id } = getQuery(event);
  if (!from || !to) throw createError({ statusCode: 400, statusMessage: 'from and to are required' });

  let wsFilter = '';
  const params: Record<string, any> = { from: String(from), to: String(to) };
  const types: Record<string, any> = { from: VARCHAR, to: VARCHAR };

  if (workspace_id) {
    wsFilter = ' AND workspace_id = $ws';
    params.ws = workspace_id;
    types.ws = VARCHAR;
  }

  const rows = await queryAll(`
    SELECT entry_date::VARCHAR as entry_date
    FROM diary_entries
    WHERE entry_date >= $from::DATE AND entry_date <= $to::DATE
      AND content IS NOT NULL AND trim(content) != ''
      ${wsFilter}
  `, params, types);

  return rows.map((r: any) => r.entry_date.slice(0, 10));
});
