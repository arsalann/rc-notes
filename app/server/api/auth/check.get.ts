import { useSession } from 'h3';
import { getSessionConfig, type SessionUser } from '~/server/utils/auth';
import { queryAll } from '~/server/utils/db';

export default defineEventHandler(async (event) => {
  // Check if any users exist with passwords
  const rows = await queryAll('SELECT count(*)::INTEGER as c FROM users WHERE password_hash IS NOT NULL');
  const configured = (rows[0]?.c ?? 0) > 0;

  if (!configured) {
    return { configured: false, user: null };
  }

  // Check if current visitor has a valid session
  try {
    const session = await useSession<{ user?: SessionUser }>(event, getSessionConfig());
    if (session.data.user) {
      return { configured: true, user: session.data.user };
    }
  } catch {
    // Invalid or expired session
  }

  return { configured: true, user: null };
});
