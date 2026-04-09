import { useSession } from 'h3';
import { getSessionConfig, type SessionUser } from '~/server/utils/auth';

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname;

  // Only protect API routes
  if (!path.startsWith('/api/')) return;

  // Skip auth and setup routes (they handle their own auth)
  if (path.startsWith('/api/auth/')) return;
  if (path.startsWith('/api/setup')) return;

  // CSRF: verify Origin header on mutating requests
  const method = event.method.toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const origin = getRequestHeader(event, 'origin');
    const host = getRequestHeader(event, 'host');
    if (origin && host) {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        throw createError({ statusCode: 403, statusMessage: 'CSRF: origin mismatch' });
      }
    }
  }

  // Session-based authentication
  let session;
  try {
    session = await useSession<{ user?: SessionUser }>(event, getSessionConfig());
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' });
  }

  if (!session.data.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' });
  }

  // Attach user to event context
  event.context.user = session.data.user;
});
