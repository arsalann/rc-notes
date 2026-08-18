import { logEvent, bufferEvent } from '~/server/utils/eventLog';

/**
 * Keys whose values must never reach event_log. `middleware/auth.ts` returns early for
 * `/api/auth/*`, but this middleware still runs, so login and signup bodies were being recorded
 * verbatim — plaintext passwords in the audit table.
 */
const SECRET_KEYS = /^(password|password_confirmation|new_password|current_password|password_hash|token|secret)$/i;

function redact(value: any): any {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEYS.test(k) ? '[redacted]' : redact(v);
    }
    return out;
  }
  return value;
}

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
      const json = JSON.stringify(redact(body) ?? null);
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
    const entry = {
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
      // Left unset on purpose: eventLog stamps it in the DB's own naive server-local format.
    };
    // Reads are buffered; every mutation is written immediately so the recovery log cannot lose a
    // write to a crash. See .context/perf-plan.md item 7.
    if (method === 'GET' || method === 'HEAD') {
      bufferEvent(entry);
    } else {
      logEvent(entry);
    }
  };

  // Fire on response close
  event.node.res.once('close', () => {
    try { event.context._logEventOnEnd?.(); } catch {}
  });
});
