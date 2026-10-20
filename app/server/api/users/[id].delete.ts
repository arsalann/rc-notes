import { requireAdmin } from '~/server/utils/auth';
import { asSystem } from '~/server/utils/db';
import { deleteUserAndData } from '~/server/utils/accounts';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const id = String(getRouterParam(event, 'id') ?? '');

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'User ID required' });
  }

  if (id === admin.id) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot delete yourself' });
  }

  // Someone else's rows are outside the admin's row level security scope: delete as the owner.
  await asSystem(() => deleteUserAndData(id));

  return { ok: true };
});
