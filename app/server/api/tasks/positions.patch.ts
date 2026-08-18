import { queryAll } from '~/server/utils/db';
import { classifyClient, deriveUpdatedBy } from '~/server/utils/eventLog';
import { listValue, LIST, VARCHAR, INTEGER } from '@duckdb/node-api';

/**
 * `PATCH /api/tasks/positions` — body `{ items: [{ id, position, priority? }] }`
 *
 * One statement for a whole reorder. The diary drag handler used to issue one `PUT /api/tasks/{id}`
 * per task; at ~180ms each, serialized behind the single shared connection, a 38-task day cost 7-8s
 * of "Saving order…". See .context/perf-plan.md item 5.
 *
 * Deliberately does NOT call `linkTaskToDiary`: position and priority cannot affect diary linkage.
 *
 * The `WHERE t.id = v.id` below is load-bearing. Without it this becomes a cross join that rewrites
 * `position` on every row in `tasks` in a single statement. Verified against a scratch copy of the
 * table: 3 targeted rows out of 521 touched.
 */
const MAX_ITEMS = 500;
const VALID_PRIORITIES = [0, 1, 2, 3];

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const items = body?.items;

  if (!Array.isArray(items) || !items.length) {
    throw createError({ statusCode: 400, statusMessage: 'items must be a non-empty array' });
  }
  if (items.length > MAX_ITEMS) {
    // A single call should not be able to renumber the whole table.
    throw createError({ statusCode: 400, statusMessage: `Too many items (max ${MAX_ITEMS})` });
  }

  const ids: string[] = [];
  const positions: number[] = [];
  const priorities: (number | null)[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const id = typeof item?.id === 'string' ? item.id.trim() : '';
    if (!id) throw createError({ statusCode: 400, statusMessage: 'each item needs an id' });
    if (seen.has(id)) {
      throw createError({ statusCode: 400, statusMessage: `duplicate id in items: ${id}` });
    }
    seen.add(id);

    // Number('') is 0 and Number('abc') is NaN — both would be written silently by the
    // single-task PUT handler. Reject them here instead.
    const position = Number(item?.position);
    if (!Number.isInteger(position) || position < 0) {
      throw createError({ statusCode: 400, statusMessage: `invalid position for ${id}` });
    }

    let priority: number | null = null;
    if (item?.priority !== undefined && item?.priority !== null) {
      const p = Number(item.priority);
      // Clamp exactly as PUT /api/tasks/[id] does, or the board becomes a way to write
      // arbitrary integers into priority.
      if (!VALID_PRIORITIES.includes(p)) {
        throw createError({ statusCode: 400, statusMessage: `invalid priority for ${id}` });
      }
      priority = p;
    }

    ids.push(id);
    positions.push(position);
    priorities.push(priority);
  }

  const updatedBy = deriveUpdatedBy(
    classifyClient(getRequestHeader(event, 'user-agent')),
    !!event.context.user
  );

  const updated = await queryAll(
    `UPDATE tasks t
     SET position = v.pos,
         priority = COALESCE(v.pri, t.priority),
         updated_at = current_timestamp,
         updated_by = $ub
     FROM (SELECT unnest($ids) AS id, unnest($positions) AS pos, unnest($priorities) AS pri) v
     WHERE t.id = v.id
     RETURNING t.id`,
    {
      ids: listValue(ids),
      positions: listValue(positions),
      priorities: listValue(priorities),
      ub: updatedBy,
    },
    {
      ids: LIST(VARCHAR),
      positions: LIST(INTEGER),
      priorities: LIST(INTEGER),
      ub: VARCHAR,
    }
  );

  // All-or-nothing now, where 37-of-38 used to be possible. Report what landed so the client can
  // tell "saved" from "some of those IDs no longer exist".
  return {
    requested: ids.length,
    updated: updated.length,
    ids: updated.map(r => String(r.id)),
  };
});
