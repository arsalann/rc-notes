import { logEvent } from '~/server/utils/eventLog';

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname;

  // Only log API calls
  if (!path.startsWith('/api/')) return;

  const method = getMethod(event);
  const query = getQuery(event);
  const userAgent = getRequestHeader(event, 'user-agent') || '';
  const ip =
    getRequestHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim() ||
    getRequestHeader(event, 'x-real-ip') ||
    event.node?.req?.socket?.remoteAddress ||
    '';
  const workspaceId = (query.workspace_id as string) || undefined;

  // Read body for POST/PUT/PATCH so we can record what changed.
  // readBody() is cached by Nitro so downstream handlers still get it.
  let bodyWsId: string | undefined;
  let bodySnapshot: string | null = null;
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    try {
      const body = await readBody(event);
      bodyWsId = body?.workspace_id;
      // Truncate to 4KB to avoid blowing up event_log on large payloads.
      const json = JSON.stringify(body ?? null);
      bodySnapshot = json.length > 4096 ? json.slice(0, 4096) + '…[truncated]' : json;
    } catch {}
  }

  // Capture user from auth session if present.
  let userId: string | null = null;
  let userName: string | null = null;
  try {
    // nuxt-auth-utils style: getUserSession or similar. Read directly off context.
    const ctx: any = event.context;
    userId = ctx?.user?.id || ctx?.session?.user?.id || null;
    userName = ctx?.user?.username || ctx?.session?.user?.username || null;
  } catch {}

  const start = Date.now();

  // Log on response — Nitro's `afterResponse` hook gives us status + duration.
  event.context._logEventOnEnd = () => {
    const status = event.node?.res?.statusCode ?? null;
    logEvent({
      method,
      path,
      workspace_id: workspaceId || bodyWsId,
      metadata: { query_params: Object.keys(query) },
      user_agent: userAgent,
      user_id: userId,
      user_name: userName,
      request_body: bodySnapshot,
      response_status: status,
      request_ip: ip,
      duration_ms: Date.now() - start,
    });
  };

  // Fire on response close
  event.node.res.once('close', () => {
    try { event.context._logEventOnEnd?.(); } catch {}
  });
});
