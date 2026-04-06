import { saveConfig, generateUserId } from '~/server/utils/config';
import { resetConnection, useDB } from '~/server/utils/db';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { username, motherduck_token } = body || {};

  if (!username || !motherduck_token) {
    throw createError({ statusCode: 400, statusMessage: 'Username and MotherDuck token are required' });
  }

  // Validate token format (alphanumeric + standard token chars)
  if (!/^[a-zA-Z0-9_\-.:=]+$/.test(motherduck_token)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid token format' });
  }

  saveConfig({ username, motherduck_token });
  resetConnection();

  // Generate user_id
  const userId = generateUserId(username, motherduck_token);

  // Trigger DB init + migrations (creates users table, backfills user_id)
  await useDB();

  return { ok: true, username, user_id: userId };
});
