import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureSchema, type Run } from './schema';

// Upgrading a database that has the schema production had before templates/tag settings: the new
// tables and the tombstone column are added, existing rows are untouched, and the old tombstone
// trigger is replaced.
let db: PGlite;
let run: Run;

const OLD_TOMBSTONE_FUNCTION = `
CREATE OR REPLACE FUNCTION daybook_sync_tombstone() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  INSERT INTO sync_tombstones (table_name, row_id, updated_device_kind, updated_device_id, sync_op_id)
  VALUES (TG_TABLE_NAME, OLD.id,
    NULLIF(current_setting('daybook.device_kind', true), ''),
    NULLIF(current_setting('daybook.device_id', true), ''),
    NULLIF(current_setting('daybook.op_id', true), ''));
  RETURN OLD;
END
$fn$`;

beforeAll(async () => {
  db = await PGlite.create('memory://');
  run = async (sql, values = []) => (await db.query<Record<string, any>>(sql, values)).rows;
  await ensureSchema(run);
  // Roll back to the previous shape.
  await run('DROP TABLE task_templates');
  await run('DROP TABLE tag_settings');
  await run('ALTER TABLE sync_tombstones DROP COLUMN row_data');
  await run(OLD_TOMBSTONE_FUNCTION);
  await run(`INSERT INTO tasks (id, display_id, title, tags) VALUES ('keep', 'exila000', 'existing', '{launch}')`);
  await run(`INSERT INTO links (id, source_type, source_id, target_type, target_id) VALUES ('old-link', 'task', 'keep', 'note', 'n')`);
  await run(`DELETE FROM links WHERE id = 'old-link'`);
});

afterAll(async () => {
  await db.close();
});

describe('schema upgrade', () => {
  it('adds the new tables and column without touching data', async () => {
    const before = await run(`SELECT * FROM tasks WHERE id = 'keep'`);
    await ensureSchema(run);
    const after = await run(`SELECT * FROM tasks WHERE id = 'keep'`);
    expect(after).toEqual(before);

    const tables = (await run(`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()`)).map(r => r.table_name);
    expect(tables).toEqual(expect.arrayContaining(['task_templates', 'tag_settings']));
    const [col] = await run(`SELECT data_type FROM information_schema.columns WHERE table_name = 'sync_tombstones' AND column_name = 'row_data'`);
    expect(col?.data_type).toBe('jsonb');

    // Old tombstones keep a NULL row_data; new deletes record the row.
    const [oldTomb] = await run(`SELECT row_data FROM sync_tombstones WHERE row_id = 'old-link'`);
    expect(oldTomb?.row_data).toBeNull();
    await run(`DELETE FROM tasks WHERE id = 'keep'`);
    const [tomb] = await run(`SELECT row_data FROM sync_tombstones WHERE row_id = 'keep'`);
    expect(tomb?.row_data).toMatchObject({ id: 'keep', title: 'existing' });
  });

  it('enables row level security on the new tables', async () => {
    const rows = await run(`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('task_templates', 'tag_settings')`);
    expect(rows.every(r => r.relrowsecurity)).toBe(true);
  });

  it('keeps one settings row per tag', async () => {
    await run(`INSERT INTO tag_settings (tag_key, label) VALUES ('growth', 'Growth!')`);
    await expect(run(`INSERT INTO tag_settings (tag_key) VALUES ('growth')`)).rejects.toThrow();
  });
});
