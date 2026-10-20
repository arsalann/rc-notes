import { useSession } from 'h3';
import { getSessionConfig, requireAuth, verifyPassword, type SessionUser } from '~/server/utils/auth';
import { queryAll } from '~/server/utils/db';
import { VARCHAR } from '~/server/utils/sqlTypes';
import { deleteUserAndData } from '~/server/utils/accounts';

/**
 * `DELETE /api/auth/account` — body `{ password }`. Deletes the signed-in user's account and all of
 * their data, then signs them out (App Store guideline 5.1.1(v)).
 * Runs as the user, so row level security limits every DELETE to their own rows.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  const body = await readBody(event).catch(() => null);
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!password) throw createError({ statusCode: 400, statusMessage: 'Password required' });

  // `/api/auth/*` skips the auth middleware: attach the user so queries run as them.
  event.context.user = user;

  const rows = await queryAll(
    'SELECT password_hash, is_admin FROM users WHERE id = $id', { id: user.id }, { id: VARCHAR },
  );
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'User not found' });
  if (!(await verifyPassword(password, String(rows[0]!.password_hash)))) {
    throw createError({ statusCode: 401, statusMessage: 'Wrong password' });
  }

  await deleteUserAndData(user.id);

  const session = await useSession<{ user?: SessionUser }>(event, getSessionConfig());
  await session.clear();
  return { ok: true };
});
