import { requireAdmin } from '~/server/utils/auth';
import { execute } from '~/server/utils/db';
import { VARCHAR } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const id = getRouterParam(event, 'id');

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'User ID required' });
  }

  if (id === admin.id) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot delete yourself' });
  }

  await execute(
    'DELETE FROM users WHERE id = $id',
    { id },
    { id: VARCHAR }
  );

  return { ok: true };
});
