import { isConfigured, getUsername, getUserId } from '~/server/utils/config';

export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname;

  // Only protect API routes
  if (!path.startsWith('/api/')) return;

  // Skip setup and auth check routes (they need to work before config exists)
  if (path.startsWith('/api/auth/')) return;
  if (path.startsWith('/api/setup')) return;

  if (!isConfigured()) {
    throw createError({ statusCode: 401, statusMessage: 'Not configured' });
  }

  // Attach user to event context
  event.context.user = {
    username: getUsername() || 'anonymous',
    user_id: getUserId() || null,
  };
});
