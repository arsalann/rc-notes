import type { H3Event } from 'h3';

/**
 * Best address to rate-limit on. Behind a proxy (Railway), the proxy appends the address it saw as
 * the LAST `X-Forwarded-For` entry; anything before it is client-supplied and spoofable, so the
 * first entry must never be trusted for security decisions.
 */
export function clientIp(event: H3Event): string {
  const forwarded = getRequestHeader(event, 'x-forwarded-for');
  const last = forwarded?.split(',').map(s => s.trim()).filter(Boolean).pop();
  return last || event.node?.req?.socket?.remoteAddress || 'unknown';
}

/** Self-service account creation. Off in production unless ALLOW_SIGNUP=true; admins add users. */
export function signupEnabled(): boolean {
  const flag = process.env.ALLOW_SIGNUP;
  if (flag !== undefined && flag !== '') return flag === 'true';
  return process.env.NODE_ENV !== 'production';
}
