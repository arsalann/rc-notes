import { logEvent } from '~/server/utils/eventLog';

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname;

  // Only log API calls
  if (!path.startsWith('/api/')) return;

  const method = getMethod(event);
  const query = getQuery(event);
  const userAgent = getRequestHeader(event, 'user-agent') || '';
  const workspaceId = (query.workspace_id as string) || undefined;

  // For POST/PUT, try to extract workspace_id from body
  let bodyWsId: string | undefined;
  if (method === 'POST' || method === 'PUT') {
    try {
      const body = await readBody(event);
      bodyWsId = body?.workspace_id;
      // Re-set the body so downstream handlers can read it
      // Nitro caches the parsed body, so this is safe
    } catch {}
  }

  // Fire and forget — don't await, don't block the request
  logEvent({
    method,
    path,
    workspace_id: workspaceId || bodyWsId,
    metadata: { query_params: Object.keys(query) },
    user_agent: userAgent,
  });
});
