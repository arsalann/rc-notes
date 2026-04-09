import { useSession } from 'h3';
import { getSessionConfig, hashPassword, type SessionUser } from '~/server/utils/auth';
import { queryAll, execute, useDB } from '~/server/utils/db';
import { VARCHAR } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  // Ensure DB is initialized
  await useDB();

  // Check no users with passwords exist yet (setup is first-user only)
  const existing = await queryAll('SELECT count(*)::INTEGER as c FROM users WHERE password_hash IS NOT NULL');
  if ((existing[0]?.c ?? 0) > 0) {
    throw createError({ statusCode: 409, statusMessage: 'Setup already completed. Use login instead.' });
  }

  const body = await readBody(event);
  const { username: rawUsername, password } = body || {};
  const username = rawUsername?.toLowerCase?.();

  if (!username || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Username and password are required' });
  }

  // Validate username: 2-30 chars, alphanumeric + underscore
  if (!/^[a-zA-Z0-9_]{2,30}$/.test(username)) {
    throw createError({ statusCode: 400, statusMessage: 'Username must be 2-30 alphanumeric characters' });
  }

  if (password.length < 8) {
    throw createError({ statusCode: 400, statusMessage: 'Password must be at least 8 characters' });
  }

  const hash = await hashPassword(password);

  // Check if a legacy user with this username exists (no password set)
  const legacyUsers = await queryAll(
    'SELECT id FROM users WHERE username = $username AND password_hash IS NULL',
    { username }, { username: VARCHAR }
  );

  let userId: string;

  if (legacyUsers.length) {
    // Upgrade legacy user: set password and make admin
    userId = legacyUsers[0].id as string;
    await execute(
      'UPDATE users SET password_hash = $hash, is_admin = true, updated_at = current_timestamp WHERE id = $id',
      { id: userId, hash },
      { id: VARCHAR, hash: VARCHAR }
    );
  } else {
    // Create new user
    const idRows = await queryAll("SELECT uuid()::VARCHAR as id");
    userId = idRows[0].id as string;

    await execute(
      'INSERT INTO users (id, username, password_hash, is_admin) VALUES ($id, $username, $hash, true)',
      { id: userId, username, hash },
      { id: VARCHAR, username: VARCHAR, hash: VARCHAR }
    );

    // Reassign any existing content rows (from old auth system) to new user
    for (const table of ['workspaces', 'tasks', 'notes', 'links', 'diary_entries', 'event_log']) {
      await execute(
        `UPDATE ${table} SET user_id = $uid WHERE user_id IS NOT NULL AND user_id != $uid`,
        { uid: userId },
        { uid: VARCHAR }
      );
    }
    for (const table of ['workspaces', 'tasks', 'notes', 'diary_entries', 'event_log']) {
      await execute(
        `UPDATE ${table} SET user_name = $uname WHERE user_name IS NOT NULL AND user_name != $uname`,
        { uname: username },
        { uname: VARCHAR }
      );
    }
  }

  // Auto-login: create session
  const session = await useSession<{ user?: SessionUser }>(event, getSessionConfig());
  await session.update({
    user: { id: userId, username, is_admin: true },
  });

  return {
    ok: true,
    user: { id: userId, username, is_admin: true },
  };
});
