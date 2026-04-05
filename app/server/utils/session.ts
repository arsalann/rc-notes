import { createHmac, randomUUID } from 'crypto';
import type { H3Event } from 'h3';
import { setCookie, getCookie, deleteCookie } from 'h3';

const COOKIE_NAME = 'rc_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

// In-memory session store (fine for single-user; clears on restart)
const sessions = new Map<string, { username: string; createdAt: number }>();

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET environment variable is required');
  return secret;
}

function sign(sessionId: string): string {
  const hmac = createHmac('sha256', getSecret());
  hmac.update(sessionId);
  return `${sessionId}.${hmac.digest('hex')}`;
}

function verify(token: string): string | null {
  const lastDot = token.lastIndexOf('.');
  if (lastDot === -1) return null;
  const sessionId = token.slice(0, lastDot);
  const expected = sign(sessionId);
  if (token !== expected) return null;
  return sessionId;
}

export function createSession(username: string): string {
  const sessionId = randomUUID();
  sessions.set(sessionId, { username, createdAt: Date.now() });
  return sign(sessionId);
}

export function validateSession(token: string): { username: string } | null {
  const sessionId = verify(token);
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session) return null;
  // Check expiry
  if (Date.now() - session.createdAt > SESSION_MAX_AGE * 1000) {
    sessions.delete(sessionId);
    return null;
  }
  return { username: session.username };
}

export function destroySession(token: string): void {
  const sessionId = verify(token);
  if (sessionId) sessions.delete(sessionId);
}

export function setSessionCookie(event: H3Event, token: string): void {
  setCookie(event, COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
}

export function getSessionCookie(event: H3Event): string | undefined {
  return getCookie(event, COOKIE_NAME);
}

export function clearSessionCookie(event: H3Event): void {
  deleteCookie(event, COOKIE_NAME, { path: '/' });
}

// Rate limiting for login attempts
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 1000; // 1 minute

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}
