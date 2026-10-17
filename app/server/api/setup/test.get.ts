import { queryAll } from '~/server/utils/db';

export default defineEventHandler(async () => {
  try {
    const rows = await queryAll('SELECT 1 as ok');
    return { ok: rows.length > 0, message: 'Connection successful' };
  } catch (err: any) {
    throw createError({ statusCode: 500, statusMessage: `Connection failed: ${err.message}` });
  }
});
