import { queryAll } from '~/server/utils/db';
import { VARCHAR, INTEGER } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const limit = Math.min(parseInt(query.limit as string) || 50, 500);
  const eventType = query.event_type as string | undefined;

  let where = '1=1';
  const params: Record<string, any> = { limit };
  const types: Record<string, any> = { limit: INTEGER };

  if (eventType) {
    where += ' AND event_type = $event_type';
    params.event_type = eventType;
    types.event_type = VARCHAR;
  }

  return await queryAll(
    `SELECT * FROM event_log WHERE ${where} ORDER BY created_at DESC LIMIT $limit`,
    params, types
  );
});
