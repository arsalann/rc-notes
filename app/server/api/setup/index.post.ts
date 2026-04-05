import { saveConfig } from '~/server/utils/config';
import { resetConnection } from '~/server/utils/db';

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

  return { ok: true, username };
});
