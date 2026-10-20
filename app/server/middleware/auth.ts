import { requireAuth } from '~/server/utils/auth';

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname;

  // Only protect API routes
  if (!path.startsWith('/api/')) return;

  // CSRF: verify Origin header on mutating requests
  const method = event.method.toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const origin = getRequestHeader(event, 'origin');
    const host = getRequestHeader(event, 'host');
    if (origin && host) {
      let originHost: string;
      try { originHost = new URL(origin).host; }
      catch { throw createError({ statusCode: 403, statusMessage: 'CSRF: invalid origin' }); }
      if (originHost !== host) {
        throw createError({ statusCode: 403, statusMessage: 'CSRF: origin mismatch' });
      }
    }
  }

  // Skip auth and setup routes (they handle their own auth)
  if (path.startsWith('/api/auth/')) return;
  if (path.startsWith('/api/setup')) return;
  if (path === '/api/health') return;

  event.context.user = await requireAuth(event);
});
