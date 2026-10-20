import { requireAdmin } from '~/server/utils/auth';
import { queryAll } from '~/server/utils/db';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  try {
    const rows = await queryAll('SELECT 1 as ok');
    return { ok: rows.length > 0, message: 'Connection successful' };
  } catch {
    throw createError({ statusCode: 500, statusMessage: 'Connection failed' });
  }
});
