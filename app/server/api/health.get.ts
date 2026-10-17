import { queryAll } from '~/server/utils/db';

/** Liveness + database check for the hosting platform (Railway healthcheck). No auth, no details. */
export default defineEventHandler(async (event) => {
  try {
    await queryAll('SELECT 1');
    return { ok: true };
  } catch {
    setResponseStatus(event, 503);
    return { ok: false };
  }
});
