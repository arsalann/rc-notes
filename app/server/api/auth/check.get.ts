import { getSessionCookie, validateSession } from '~/server/utils/session';
import { isConfigured, getUsername } from '~/server/utils/config';

export default defineEventHandler((event) => {
  const token = getSessionCookie(event);
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' });
  }

  const session = validateSession(token);
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Session expired' });
  }

  return {
    authenticated: true,
    username: session.username || getUsername(),
    configured: isConfigured(),
  };
});
