import { requireAuth, verifyPassword, hashPassword } from '~/server/utils/auth';
import { queryAll, execute } from '~/server/utils/db';
import { VARCHAR } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  const body = await readBody(event);
  const { current_password, new_password } = body || {};

  if (!current_password || !new_password) {
    throw createError({ statusCode: 400, statusMessage: 'Current and new password required' });
  }

  if (new_password.length < 8) {
    throw createError({ statusCode: 400, statusMessage: 'New password must be at least 8 characters' });
  }

  // Verify current password
  const rows = await queryAll(
    'SELECT password_hash FROM users WHERE id = $id',
    { id: user.id },
    { id: VARCHAR }
  );

  if (!rows.length) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' });
  }

  const valid = await verifyPassword(current_password, rows[0].password_hash as string);
  if (!valid) {
    throw createError({ statusCode: 401, statusMessage: 'Current password is incorrect' });
  }

  // Update password
  const newHash = await hashPassword(new_password);
  await execute(
    'UPDATE users SET password_hash = $hash, updated_at = current_timestamp WHERE id = $id',
    { hash: newHash, id: user.id },
    { hash: VARCHAR, id: VARCHAR }
  );

  return { ok: true };
});
