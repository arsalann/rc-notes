import { queryAll } from '~/server/utils/db';
import { VARCHAR, INTEGER } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const name = body.name?.trim();
  const emoji = body.emoji?.trim() || '';
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' });

  const posRows = await queryAll('SELECT COALESCE(MAX(position), -1) + 1 as p FROM workspaces');
  const position = posRows[0]?.p ?? 0;

  const rows = await queryAll(
    'INSERT INTO workspaces (id, name, emoji, position) VALUES (uuid()::VARCHAR, $name, $emoji, $position) RETURNING *',
    { name, emoji, position },
    { name: VARCHAR, emoji: VARCHAR, position: INTEGER }
  );
  setResponseStatus(event, 201);
  return rows[0];
});
