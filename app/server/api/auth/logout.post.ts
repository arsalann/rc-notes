import { getSessionCookie, destroySession, clearSessionCookie } from '~/server/utils/session';

export default defineEventHandler((event) => {
  const token = getSessionCookie(event);
  if (token) destroySession(token);
  clearSessionCookie(event);
  return { ok: true };
});
