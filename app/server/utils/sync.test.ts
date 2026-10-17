import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureSchema, type Run } from './schema';
import { editTime } from './syncContext';

// The sync triggers on an in-memory embedded Postgres. A "device edit" sets the same per-transaction
// settings the server sets before a write (see `db.ts`).
let db: PGlite;
let run: Run;

async function edit(sql: string, ctx: { time?: string; device?: string; kind?: string; op?: string; by?: string } = {}) {
  await db.transaction(async (tx) => {
    await tx.query(
      `SELECT set_config('daybook.op_time', $1, true), set_config('daybook.device_id', $2, true),
              set_config('daybook.device_kind', $3, true), set_config('daybook.op_id', $4, true),
              set_config('daybook.updated_by', $5, true)`,
      [ctx.time ?? '', ctx.device ?? '', ctx.kind ?? '', ctx.op ?? '', ctx.by ?? ''],
    );
    await tx.query(sql);
  });
}

const task = async () => (await run(`SELECT * FROM tasks WHERE id = 't1'`))[0]!;

beforeAll(async () => {
  db = await PGlite.create('memory://');
  run = async (sql, values = []) => (await db.query<Record<string, any>>(sql, values)).rows;
  await ensureSchema(run);
  await run(`INSERT INTO tasks (id, title, priority) VALUES ('t1', 'first', 2)`);
});

afterAll(async () => {
  await db.close();
});

describe('sync triggers', () => {
  it('numbers every write and records the device', async () => {
    const before = Number((await task()).sync_seq);
    await edit(`UPDATE tasks SET title = 'phone' WHERE id = 't1'`, { time: '2026-01-01 10:00:00', device: 'd1', kind: 'ios', op: 'op1', by: 'user_in_ios_app' });
    const row = await task();
    expect(Number(row.sync_seq)).toBeGreaterThan(before);
    expect(row).toMatchObject({ title: 'phone', updated_device_id: 'd1', updated_device_kind: 'ios', sync_op_id: 'op1', updated_by: 'user_in_ios_app' });
    const [{ t }] = await run(`SELECT client_updated_at::text AS t FROM tasks WHERE id = 't1'`);
    expect(t).toBe('2026-01-01 10:00:00');
    expect(row.field_clock.title).toBe('2026-01-01 10:00:00.000000');
  });

  it('keeps a newer edit of a field over an older one, per field', async () => {
    await edit(`UPDATE tasks SET title = 'newer' WHERE id = 't1'`, { time: '2026-01-01 12:00:00' });
    await edit(`UPDATE tasks SET title = 'older', priority = 3 WHERE id = 't1'`, { time: '2026-01-01 11:00:00', device: 'd2' });
    const row = await task();
    expect(row.title).toBe('newer');
    expect(row.priority).toBe(3);
    expect(row.updated_device_id).toBe('d2');
  });

  it('leaves the row untouched when every field of an edit is older', async () => {
    const before = await task();
    await edit(`UPDATE tasks SET title = 'stale', updated_at = '2030-01-01' WHERE id = 't1'`, { time: '2026-01-01 09:00:00', device: 'd3' });
    const row = await task();
    expect(row.title).toBe('newer');
    expect(row.updated_at).toEqual(before.updated_at);
    expect(row.updated_device_id).toBe(before.updated_device_id);
  });

  it('moves status, completed and completed_at together', async () => {
    await edit(`UPDATE tasks SET status = 'done', completed = true, completed_at = now() WHERE id = 't1'`, { time: '2026-01-02 10:00:00' });
    await edit(`UPDATE tasks SET status = 'next', completed = false, completed_at = NULL WHERE id = 't1'`, { time: '2026-01-02 09:00:00' });
    const row = await task();
    expect([row.status, row.completed, row.completed_at !== null]).toEqual(['done', true, true]);
  });

  it('treats a write without a device time as made now', async () => {
    await run(`UPDATE tasks SET title = 'server' WHERE id = 't1'`);
    expect((await task()).title).toBe('server');
  });

  it('records a tombstone for a hard delete', async () => {
    await run(`INSERT INTO links (id, source_type, source_id, target_type, target_id) VALUES ('l1', 'task', 't1', 'note', 'n1')`);
    await edit(`DELETE FROM links WHERE id = 'l1'`, { device: 'd4', kind: 'browser' });
    const tomb = await run(`SELECT * FROM sync_tombstones WHERE row_id = 'l1'`);
    expect(tomb[0]).toMatchObject({ table_name: 'links', updated_device_id: 'd4', updated_device_kind: 'browser' });
  });

  it('runs no DDL on a second boot', async () => {
    const statements: string[] = [];
    await ensureSchema(async (sql, values) => {
      statements.push(sql);
      return run(sql, values);
    });
    const ddl = statements.filter(s => /^\s*(CREATE|ALTER)\b/i.test(s) && !/IF NOT EXISTS/i.test(s));
    expect(ddl).toEqual([]);
  });
});

describe('editTime', () => {
  const now = new Date('2026-10-17T12:00:00Z');
  it('caps device clocks that run ahead', () => {
    expect(editTime('2026-10-18T12:00:00Z', now)).toBe('2026-10-17 12:00:00.000');
  });
  it('keeps past device times', () => {
    expect(editTime('2026-10-17T09:30:00.250Z', now)).toBe('2026-10-17 09:30:00.250');
  });
  it('ignores missing or implausible values', () => {
    expect(editTime(undefined, now)).toBeNull();
    expect(editTime('nonsense', now)).toBeNull();
    expect(editTime('2001-01-01T00:00:00Z', now)).toBeNull();
  });
});
