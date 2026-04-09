import { queryAll, useDB } from '~/server/utils/db';

export default defineEventHandler(async () => {
  await useDB();
  const rows = await queryAll('SELECT count(*)::INTEGER as c FROM users WHERE password_hash IS NOT NULL');
  return { configured: (rows[0]?.c ?? 0) > 0 };
});
