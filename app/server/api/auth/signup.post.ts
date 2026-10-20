import { useSession } from 'h3';
import { getSessionConfig, hashPassword, type SessionUser } from '~/server/utils/auth';
import { queryAll, execute, ensureUserWorkspaces } from '~/server/utils/db';
import { VARCHAR } from '~/server/utils/sqlTypes';
import { clientIp, signupEnabled } from '~/server/utils/requestPolicy';

// Accounts created per address per hour, in memory (one server process).
const created = new Map<string, { count: number; resetAt: number }>();
const MAX_SIGNUPS = 5;
const WINDOW_MS = 60 * 60 * 1000;

function allowSignup(ip: string): boolean {
  const now = Date.now();
  const entry = created.get(ip);
  if (!entry || now > entry.resetAt) return true;
  return entry.count < MAX_SIGNUPS;
}

function countSignup(ip: string) {
  const now = Date.now();
  const entry = created.get(ip);
  if (!entry || now > entry.resetAt) created.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  else entry.count++;
}

export default defineEventHandler(async (event) => {
  if (!signupEnabled()) {
    throw createError({ statusCode: 403, statusMessage: 'Sign-up is turned off. Ask an admin to add you.' });
  }
  const ip = clientIp(event);
  if (!allowSignup(ip)) {
    throw createError({ statusCode: 429, statusMessage: 'Too many accounts created. Try again later.' });
  }
  const body = await readBody(event);
  const { username: rawUsername, password } = body || {};
  const username = rawUsername?.toLowerCase?.();

  if (!username || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Username and password required' });
  }

  if (!/^[a-zA-Z0-9_]{2,30}$/.test(username)) {
    throw createError({ statusCode: 400, statusMessage: 'Username must be 2-30 alphanumeric characters' });
  }

  if (password.length < 8) {
    throw createError({ statusCode: 400, statusMessage: 'Password must be at least 8 characters' });
  }

  // Check username uniqueness
  const existing = await queryAll(
    'SELECT id FROM users WHERE username = $username',
    { username },
    { username: VARCHAR }
  );
  if (existing.length) {
    throw createError({ statusCode: 409, statusMessage: 'Username already taken' });
  }

  const hash = await hashPassword(password);
  const idRows = await queryAll("SELECT gen_random_uuid()::text as id");
  const userId = idRows[0].id as string;

  await execute(
    'INSERT INTO users (id, username, password_hash, is_admin) VALUES ($id, $username, $hash, false)',
    { id: userId, username, hash },
    { id: VARCHAR, username: VARCHAR, hash: VARCHAR }
  );

  countSignup(ip);

  // Auto-login after signup
  const session = await useSession<{ user?: SessionUser }>(event, getSessionConfig());
  await session.update({
    user: { id: userId, username, is_admin: false },
  });

  event.context.user = { id: userId, username, is_admin: false };
  await ensureUserWorkspaces();

  return {
    ok: true,
    user: { id: userId, username, is_admin: false },
  };
});
