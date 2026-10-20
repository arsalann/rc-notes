import bcrypt from 'bcryptjs';
import { queryAll } from './db';
import { VARCHAR } from './sqlTypes';
import type { H3Event } from 'h3';
import { useSession, createError } from 'h3';

export interface SessionUser {
  id: string;
  username: string;
  is_admin: boolean;
}

const BCRYPT_ROUNDS = 12;

export function getSessionConfig() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw createError({ statusCode: 500, statusMessage: 'SESSION_SECRET env var must be set (min 32 chars)' });
  }
  return {
    password: secret,
    maxAge: 60 * 60 * 24 * 30, // 30 days; the client heartbeat rolls this forward while active
    name: 'rc-session',
    // The local app is served over HTTP (including phone/LAN access). Keep Secure in production,
    // where the app is expected to run behind HTTPS, but do not create a cookie the dev browser
    // cannot send back over http://localhost or a local network address.
    cookie: { secure: process.env.NODE_ENV === 'production' },
  };
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function requireAuth(event: H3Event): Promise<SessionUser> {
  if (event.context._authenticatedUser) return event.context._authenticatedUser as SessionUser;
  const session = await useSession<{ user?: SessionUser }>(event, getSessionConfig()).catch(() => {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' });
  });
  const id = session.data.user?.id;
  if (!id) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' });
  // Cookies on other devices outlive account deletion. Check the live account and current admin
  // permission rather than accepting the signed cookie as proof the account still exists.
  const rows = await queryAll(
    'SELECT id, username, is_admin FROM users WHERE id = $id AND password_hash IS NOT NULL',
    { id }, { id: VARCHAR },
  );
  if (!rows.length) {
    await session.clear();
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' });
  }
  const user = rows[0] as unknown as SessionUser;
  event.context._authenticatedUser = user;
  event.context.user = user;
  return user;
}

export async function requireAdmin(event: H3Event): Promise<SessionUser> {
  const user = await requireAuth(event);
  if (!user.is_admin) {
    throw createError({ statusCode: 403, statusMessage: 'Admin access required' });
  }
  return user;
}
