import { useSession } from 'h3';
import { getSessionConfig, verifyPassword, type SessionUser } from '~/server/utils/auth';
import { queryAll } from '~/server/utils/db';
import { VARCHAR } from '@duckdb/node-api';

// Simple in-memory rate limiter
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= MAX_ATTEMPTS;
}

function clearRateLimit(ip: string) {
  attempts.delete(ip);
}

export default defineEventHandler(async (event) => {
  const ip = getRequestHeader(event, 'x-forwarded-for') || 'unknown';

  if (!checkRateLimit(ip)) {
    throw createError({ statusCode: 429, statusMessage: 'Too many login attempts. Try again later.' });
  }

  const body = await readBody(event);
  const { username: rawUsername, password } = body || {};
  const username = rawUsername?.toLowerCase?.();

  if (!username || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Username and password required' });
  }

  const users = await queryAll(
    'SELECT id, username, password_hash, is_admin FROM users WHERE username = $username AND password_hash IS NOT NULL',
    { username },
    { username: VARCHAR }
  );

  if (!users.length) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' });
  }

  const user = users[0];
  const valid = await verifyPassword(password, user.password_hash as string);

  if (!valid) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' });
  }

  // Clear rate limit on success
  clearRateLimit(ip);

  // Create session
  const session = await useSession<{ user?: SessionUser }>(event, getSessionConfig());
  await session.update({
    user: {
      id: user.id as string,
      username: user.username as string,
      is_admin: !!user.is_admin,
    },
  });

  return {
    ok: true,
    user: {
      id: user.id,
      username: user.username,
      is_admin: !!user.is_admin,
    },
  };
});
