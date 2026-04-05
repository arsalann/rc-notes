import bcrypt from 'bcryptjs';
import { createSession, setSessionCookie, checkRateLimit } from '~/server/utils/session';
import { getUsername } from '~/server/utils/config';

export default defineEventHandler(async (event) => {
  const ip = getRequestHeader(event, 'x-forwarded-for') || 'unknown';
  if (!checkRateLimit(ip)) {
    throw createError({ statusCode: 429, statusMessage: 'Too many login attempts. Try again in a minute.' });
  }

  const body = await readBody(event);
  const { password } = body || {};

  if (!password) {
    throw createError({ statusCode: 400, statusMessage: 'Password is required' });
  }

  const hash = process.env.MASTER_PASSWORD_HASH;
  if (!hash) {
    throw createError({ statusCode: 500, statusMessage: 'Authentication not configured' });
  }

  const valid = await bcrypt.compare(password, hash);
  if (!valid) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid password' });
  }

  const username = getUsername() || 'user';
  const token = createSession(username);
  setSessionCookie(event, token);

  return { ok: true, username };
});
