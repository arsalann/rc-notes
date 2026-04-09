import { useSession } from 'h3';
import { getSessionConfig } from '~/server/utils/auth';

export default defineEventHandler(async (event) => {
  const session = await useSession(event, getSessionConfig());
  await session.clear();
  return { ok: true };
});
