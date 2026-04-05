import { getSessionCookie, validateSession } from '~/server/utils/session';
import { getUsername } from '~/server/utils/config';

export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname;

  // Only protect API routes
  if (!path.startsWith('/api/')) return;

  // Skip auth routes (login/logout/check)
  if (path.startsWith('/api/auth/')) return;

  const token = getSessionCookie(event);
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const session = validateSession(token);
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Session expired' });
  }

  // Attach user to event context
  event.context.user = {
    username: session.username || getUsername() || 'anonymous',
  };
});
