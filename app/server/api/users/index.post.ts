import { requireAdmin, hashPassword } from '~/server/utils/auth';
import { queryAll, execute } from '~/server/utils/db';
import { VARCHAR } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const body = await readBody(event);
  const { username: rawUsername, password } = body || {};
  const username = rawUsername?.toLowerCase?.();

  if (!username || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Username and password required' });
  }

  if (!/^[a-zA-Z0-9_]{2,30}$/.test(username)) {
    throw createError({ statusCode: 400, statusMessage: 'Username must be 2-30 alphanumeric characters' });
  }

  if (password.length < 8) {
    throw createError({ statusCode: 400, statusMessage: 'Password must be at least 8 characters' });
  }

  // Check username uniqueness
  const existing = await queryAll(
    'SELECT id FROM users WHERE username = $username',
    { username },
    { username: VARCHAR }
  );
  if (existing.length) {
    throw createError({ statusCode: 409, statusMessage: 'Username already taken' });
  }

  const hash = await hashPassword(password);
  const idRows = await queryAll("SELECT uuid()::VARCHAR as id");
  const userId = idRows[0].id as string;

  await execute(
    'INSERT INTO users (id, username, password_hash, is_admin) VALUES ($id, $username, $hash, false)',
    { id: userId, username, hash },
    { id: VARCHAR, username: VARCHAR, hash: VARCHAR }
  );

  return { id: userId, username, is_admin: false };
});
