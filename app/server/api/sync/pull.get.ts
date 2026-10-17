import { queryAll } from '~/server/utils/db';
import { SYNCED_TABLES } from '~/server/utils/schema';
import { BIGINT, INTEGER } from '~/server/utils/sqlTypes';

/**
 * `GET /api/sync/pull?since=<cursor>&limit=<n>` — every row of the synced tables written after
 * `since` (a `sync_seq` value), plus tombstones of deleted rows. `since=0` is a full copy.
 *
 * Returns `{ cursor, more, server_time, rows: { <table>: [...] }, tombstones: [...] }`. Rows have the
 * same shapes and timestamp text as the other endpoints. Call again with `since=cursor` while
 * `more` is true. Rows may repeat across calls; applying a row twice is harmless.
 */
const DEFAULT_LIMIT = 2000;
const MAX_LIMIT = 5000;

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const since = Math.max(0, Math.floor(Number(query.since) || 0));
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(query.limit) || DEFAULT_LIMIT)));

  const rows: Record<string, Record<string, any>[]> = {};
  // Every row up to `cursor` is in this response. A table that hit the limit caps it at its last
  // row; otherwise it is the highest number seen.
  let highest = since;
  let cap = Number.POSITIVE_INFINITY;

  const read = async (table: string) => {
    const found = await queryAll(
      `SELECT * FROM ${table} WHERE sync_seq > $since ORDER BY sync_seq LIMIT $limit`,
      { since, limit }, { since: BIGINT, limit: INTEGER },
    );
    for (const row of found) delete row.field_clock;
    const last = found.length ? Number(found[found.length - 1]!.sync_seq) : since;
    highest = Math.max(highest, last);
    if (found.length === limit) cap = Math.min(cap, last);
    return found;
  };

  for (const table of SYNCED_TABLES) rows[table] = await read(table);
  const tombstones = await read('sync_tombstones');

  const more = Number.isFinite(cap);
  return {
    cursor: more ? cap : highest,
    more,
    server_time: new Date().toISOString(),
    rows,
    tombstones: tombstones.map(t => ({ table_name: t.table_name, row_id: t.row_id, sync_seq: t.sync_seq })),
  };
});
