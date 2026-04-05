import { isConfigured } from '~/server/utils/config';

export default defineEventHandler(async () => {
  if (!isConfigured()) {
    throw createError({ statusCode: 400, statusMessage: 'Not configured yet' });
  }

  try {
    const { useDB } = await import('~/server/utils/db');
    const db = await useDB();
    const result = await db.runAndReadAll('SELECT 1 as ok');
    const rows = result.getRowObjectsJson();
    return { ok: rows.length > 0, message: 'Connection successful' };
  } catch (err: any) {
    throw createError({ statusCode: 500, statusMessage: `Connection failed: ${err.message}` });
  }
});
