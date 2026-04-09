import { requireAdmin } from '~/server/utils/auth';
import { queryAll } from '~/server/utils/db';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const users = await queryAll(
    'SELECT id, username, is_admin, created_at FROM users WHERE password_hash IS NOT NULL ORDER BY created_at'
  );

  return users;
});
